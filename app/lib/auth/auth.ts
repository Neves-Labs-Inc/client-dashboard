import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import {
  genericOAuth,
  magicLink,
  organization as organizationPlugin,
} from "better-auth/plugins";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { CLIENT_IP_HEADER, withClientIp } from "@/lib/auth/client-ip";
import { buildMagicLinkEmail } from "@/lib/auth/emails";
import { consumeEmailQuota } from "@/lib/auth/email-quota";
import { withSafeRedirects } from "@/lib/auth/magic-link-url";
import {
  isBuiltInProviderId,
  type CustomOAuth,
  type ProviderRegistry,
} from "@/lib/auth/providers";
import { getStanding, type Standing } from "@/lib/auth/standing";
import { describeError } from "@/lib/describe-error";
import { createInvitationEligibilityHook } from "@/lib/auth/invite-eligibility";
import {
  joinInvitation,
  type JoinError,
  type Joined,
} from "@/lib/auth/join-invitation";
import {
  INVITATION_EXPIRES_IN_S,
  Invitations,
  type Invitation,
  type InvitationActionError,
  type InviteError,
  type MemberInvitationActionError,
  type MemberInviteError,
} from "@/lib/auth/invitations";
import { Roster, type Role, type RosterError } from "@/lib/auth/roster";
import {
  ClientArchive,
  type ArchivedClient,
  type ArchiveError,
} from "@/lib/auth/client-archive";
import { getClientNameError, normalizeClientName } from "@/lib/client-name";
import type { Db } from "@/lib/db/db";
import {
  account,
  clients,
  invitation,
  member,
  organization,
  passkey,
  rateLimit,
  session,
  type SignInMethod,
  user,
  verification,
} from "@/lib/db/schema";
import type { Mailer } from "@/lib/mailer/mailer";
import type { Result } from "@/lib/result";
import { isValidUserName, normalizeUserName } from "@/lib/user-name";

// The one module that wraps Better Auth (ADR 0001): nothing else on the
// server imports it. Better Auth runs on the system pool (ADR 0003).

const MINUTE_S = 60;
const DAY_S = 24 * 60 * MINUTE_S;
const HOUR_MS = 60 * MINUTE_S * 1000;
const BASE_PATH = "/api/auth";
const SESSION_EXPIRES_IN_S = 90 * DAY_S;
// Sliding: a used session is extended at most once a day.
const SESSION_UPDATE_AGE_S = DAY_S;
const MAGIC_LINK_EXPIRES_IN_S = 15 * MINUTE_S;
const MAGIC_LINK_RATE_LIMIT = { window: 60, max: 5 };
// Each options request writes a challenge row, and sign-in options need no
// session, so these are capped well under Better Auth's 100 per 10 s.
const PASSKEY_RATE_LIMIT = { window: 60, max: 10 };
// Each social sign-in request writes an OAuth state row, so it and the
// callback get the same cap (replacing Better Auth's defaults for them).
const SOCIAL_RATE_LIMIT = { window: 60, max: 10 };
// On top of the per-IP limit: rotating IPs still can't send one address more
// than this many links an hour (mail-bombing, Gmail's daily sending cap).
const MAGIC_LINK_EMAIL_QUOTA = { windowMs: HOUR_MS, max: 10 };
const PASSKEY_RP_NAME = "Neves Labs portal";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const CLIENT_NAME_INDEX = "organization_name_lower_key";
const OK = 200;
const CREATED = 201;
const FORBIDDEN = 403;
const UNPROCESSABLE = 422;
const CONFLICT = 409;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
// Better Auth's providerId for a linked Google account.
const GOOGLE_PROVIDER_ID = "google";
const MAGIC_LINK_PATH = "/sign-in/magic-link";
const INVITATION_PAGE_PREFIX = "/invitations/";
// A bad or reused emailed link lands here with ?error= (Phase 2's banner).
const MAGIC_LINK_ERROR_PATH = "/sign-in";
const JOIN_ERROR_STATUS: Record<JoinError, number> = {
  "not-found": NOT_FOUND,
  "email-mismatch": FORBIDDEN,
  ineligible: CONFLICT,
  archived: FORBIDDEN,
};
// Better Auth's OAuth callback: `context.path` is this pattern, and the
// provider id is `context.params.id`.
const CALLBACK_PATH = "/callback/:id";
const SOCIAL_SIGN_IN_PATH = "/sign-in/social";
// Every organization plugin endpoint lives under this prefix. Roster work
// runs server-side in the module, so none of them is reachable over HTTP.
const ORGANIZATION_PREFIX = `${BASE_PATH}/organization`;
const NO_ACCESS_PATH = "/no-access";
const NO_PROVIDER_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

// Better Auth endpoints the portal never calls over HTTP. Closed so a
// magic-link session (which may only register a passkey) can't list or
// delete passkeys, revoke sessions or edit the user. Server-side auth.api
// calls are unaffected.
const DISABLED_PATHS = [
  "/passkey/list-user-passkeys",
  "/passkey/delete-passkey",
  "/passkey/update-passkey",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/update-session",
  "/update-user",
  "/delete-user",
  "/delete-user/callback",
  "/change-email",
  "/list-accounts",
  "/account-info",
  "/link-social",
  "/unlink-account",
  "/get-access-token",
  "/refresh-token",
];

// All an Admin's magic-link session may reach over HTTP: register a passkey,
// then sign in with it (the /passkey page does both from this session), open
// a newer magic link, read its session and sign out. Anything else is 403,
// whatever the disabled list says.
const MAGIC_LINK_ADMIN_PATHS = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/magic-link/verify",
  "/get-session",
  "/sign-out",
]);

// The endpoints allowed to create a session, and the sign-in method each
// records; the OAuth callback takes its provider's method from the registry.
// Any other path (e.g. passkey registration with createSession) is refused,
// so every session says how it was proven.
const SIGN_IN_METHOD_BY_PATH: Record<string, SignInMethod> = {
  "/magic-link/verify": "magic-link",
  "/passkey/verify-authentication": "passkey",
};

export type Access =
  | { kind: "anonymous" }
  // A magic-link session: it may only register a passkey.
  | { kind: "admin-needs-passkey"; email: string }
  // A passkey session: the Admin area.
  | { kind: "admin"; email: string }
  // A Client User of an active Client.
  | {
      kind: "client";
      userId: string;
      email: string;
      name: string;
      clientId: string;
      clientName: string;
      role: "owner" | "member";
    }
  // No member row, but a live, eligible Invitation: it may only join.
  | { kind: "invitee"; userId: string; email: string }
  // A session whose user can't be let in (rare: sign-in refuses them first).
  | { kind: "no-access"; reason: NoAccessReason };

export type NoAccessReason = "archived" | "not-invited";

export type ClientAccess = Extract<Access, { kind: "client" }>;

export type { ArchivedClient, ArchiveError, JoinError, Joined, RosterError };

// Who changes a roster: the Admin, or an Owner of that same Client.
export type RosterActor = { kind: "admin" } | ClientAccess;

// What the Invitation page may show the link holder, for a live one only.
export type LiveInvitation = { email: string; clientName: string };

// failed: Better Auth answered anything but a send or a rate limit.
export type InvitationLinkError = "not-found" | "rate-limited" | "failed";

export type AccessResult = {
  access: Access;
  // Set-Cookie headers when the session slid (renewed at most once a day).
  // Callers must put them on their response, or the browser's cookie keeps
  // its original expiry and the session ends 90 days after sign-in.
  headers: Headers;
};

export type ClientSummary = {
  id: string;
  name: string;
  createdAt: Date;
  userCount: number;
  // The Owner's email; pending while a live invitation awaits one; null
  // when the Client has neither.
  owner: { email: string } | { pending: true } | null;
};

export type CreateClientError = "invalid-name" | "duplicate-name";

// What a Client User's Profile page shows. canLeave: "last-owner" = the only
// Owner of a Client with other users (Leave is refused); "only-user" = the
// Client's sole user (Leave empties it); "yes" otherwise.
export type Profile = {
  name: string;
  email: string;
  role: "owner" | "member";
  clientName: string;
  isGoogleLinked: boolean;
  canLeave: "yes" | "only-user" | "last-owner";
};

export type TeamMember = {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "member";
};

export type PendingInvitation = Invitation & {
  // Which role accepting it gives.
  role: "owner" | "member";
};

export type Team = {
  clientId: string;
  name: string;
  // Null while the Client is active.
  archivedAt: Date | null;
  // Oldest first.
  members: TeamMember[];
  // Live only (pending and unexpired), newest first.
  pendingInvitations: PendingInvitation[];
  // Active, with no members and no live pending invitation.
  canInviteFirstOwner: boolean;
};

export type Auth = {
  // Better Auth's HTTP handler, mounted at /api/auth/*.
  handler(request: Request): Promise<Response>;
  getAccess(request: Request): Promise<AccessResult>;
  // Ids of the enabled social providers (e.g. "google"), for the sign-in
  // screens. Empty when none is configured.
  listSocialProviders(): string[];
  // Revokes the request's session. The returned headers carry the Set-Cookie
  // headers that clear it. Throws, clearing nothing, when the session row
  // can't be deleted.
  signOut(request: Request): Promise<Headers>;
  // Active Clients, sorted by name (case-insensitive).
  listClients(): Promise<ClientSummary[]>;
  // A new Client with no members: the Admin belongs to none. The name is
  // trimmed and unique case-insensitively, archived Clients included.
  createClient(
    name: string,
  ): Promise<Result<{ clientId: string }, CreateClientError>>;
  // Null when there is no such Client (or the id isn't a UUID).
  getTeam(clientId: string): Promise<Team | null>;
  // The Client's first Owner-to-be, invited by the Admin and emailed. The
  // email is normalised (trimmed, NFC, lowercase). Refusals, in order:
  // invalid-email, client-not-found, archived, admin-email, other-client,
  // not-first-owner, pending-exists, too-many-emails, too-many-invitations.
  // A failed email still
  // succeeds: the row stays, and the Admin can resend.
  inviteFirstOwner(
    clientId: string,
    email: string,
  ): Promise<Result<Invitation, InviteError>>;
  // Any live pending Invitation of this Client (an Owner's or a Member's),
  // emailed again in its role's copy with the same link and 7 more days.
  // The Admin's invites and resends share a cap of 5 emails an hour per
  // address with Owners' (too-many-emails), and 20 an hour in all
  // (too-many-invitations). Refused while the Client is archived.
  resendInvitation(
    clientId: string,
    invitationId: string,
  ): Promise<Result<Invitation, InvitationActionError>>;
  // Any live pending Invitation of this Client, canceled. Refused while the
  // Client is archived.
  revokeInvitation(
    clientId: string,
    invitationId: string,
  ): Promise<Result<null, InvitationActionError>>;
  // Joins the request's session to the Client of Invitation `invitationId`
  // (or of the newest live Invitation for its email when null): the member
  // row with the Invitation's role, and the Invitation accepted. Bound to
  // the session's own email, so it's safe to run from a GET loader, and
  // idempotent: the member re-opening their accepted Invitation gets their
  // Client back. Status 201 when this call joined, 200 when they already
  // were a member. Malformed ids and anonymous requests are not-found.
  joinInvitation(
    request: Request,
    invitationId: string | null,
  ): Promise<Result<Joined, JoinError>>;
  // A live (pending, unexpired) Invitation's email and Client name; null for
  // any other id, malformed ones included.
  getLiveInvitation(invitationId: string): Promise<LiveInvitation | null>;
  // Emails a magic link to the live Invitation's own address (never one the
  // browser names) that returns to its page. Rate-limited per IP as the
  // sign-in screen's request is; who is mailed follows the same rules.
  requestInvitationLink(
    request: Request,
    invitationId: string,
  ): Promise<Result<null, InvitationLinkError>>;
  // An Owner's Invitation to their own Client, always as a Member, emailed
  // naming the Owner. The email is normalised as for inviteFirstOwner.
  // Refusals, in order: forbidden (not an Owner of an active Client),
  // invalid-email, ineligible (ADMIN_EMAIL or another Client's user),
  // already-member, pending-exists (to this email), too-many-emails (the
  // per-address cap shared with the Admin), too-many-for-client (20 an hour
  // per Client). A failed email still succeeds.
  inviteMember(
    access: ClientAccess,
    email: string,
  ): Promise<Result<Invitation, MemberInviteError>>;
  // A live pending Invitation of the Owner's Client, emailed again with the
  // same link and 7 more days, under the same caps as inviteMember.
  resendMemberInvitation(
    access: ClientAccess,
    invitationId: string,
  ): Promise<Result<Invitation, MemberInvitationActionError>>;
  // A live pending Invitation of the Owner's Client, canceled.
  revokeMemberInvitation(
    access: ClientAccess,
    invitationId: string,
  ): Promise<Result<null, MemberInvitationActionError>>;
  // Makes a member of the Client an Owner or a Member. Refusals, in order:
  // forbidden (a Member, or an Owner of another Client), not-found (no such
  // member, or a malformed id), self (an Owner's own row), archived,
  // no-change (that role already), last-owner (the Client's last Owner is
  // never demoted, by the Admin either). Revokes nothing: access is read
  // per request.
  changeRole(
    actor: RosterActor,
    clientId: string,
    userId: string,
    role: Role,
  ): Promise<Result<null, RosterError>>;
  // Takes a member off the Client: their member row and every session go,
  // their user row stays. Refusals as changeRole, but the Admin may remove
  // users of an archived Client, and a sole Owner who is the Client's only
  // user (the Client is then empty, and its pending Invitations are
  // canceled). Otherwise the last Owner is refused while others remain
  // (last-owner).
  removeMember(
    actor: RosterActor,
    clientId: string,
    userId: string,
  ): Promise<Result<null, RosterError>>;
  // The Client User leaves their Client, as removeMember: a last Owner may
  // leave only as its only user. Refusals: not-found (no longer a member),
  // archived, last-owner.
  leaveClient(access: ClientAccess): Promise<Result<null, RosterError>>;
  // Locks the Client out, Admin only: archived_at set (kept when already
  // archived), its live pending Invitations canceled and every session of
  // its members deleted, in one transaction. Nothing is deleted otherwise,
  // and sign-in refuses its members with the archived reason. Idempotent.
  archiveClient(clientId: string): Promise<Result<null, ArchiveError>>;
  // Clears archived_at: members may sign in again. Canceled Invitations stay
  // canceled. Idempotent.
  unarchiveClient(clientId: string): Promise<Result<null, ArchiveError>>;
  // Archived Clients, sorted by name (case-insensitive).
  listArchivedClients(): Promise<ArchivedClient[]>;
  // The Client User's own Profile, read fresh.
  getProfile(access: ClientAccess): Promise<Profile>;
  // Sets the user's display name (stored trimmed, NFC, whitespace collapsed).
  // Refusal: invalid-name (blank, over 100 characters, or hidden characters).
  // Written here, never through Better Auth's /update-user (disabled).
  updateDisplayName(
    access: ClientAccess,
    name: string,
  ): Promise<Result<null, "invalid-name">>;
};

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  adminEmail: string;
  // BETTER_AUTH_URL: an origin with no trailing slash.
  baseUrl: string;
  secret: string;
  // True only on Vercel, which overwrites X-Forwarded-For with the client
  // IP. Elsewhere the header is client-controlled and ignored.
  trustForwardedFor: boolean;
  // Runs the magic-link eligibility check, quota check and send after the
  // response instead of before it (Vercel's waitUntil in production). The
  // task never rejects.
  runInBackground: (task: Promise<void>) => void;
  // The enabled social providers (getProviderRegistry). None by default.
  providers?: ProviderRegistry;
  // Clock for the module's own time rules (the magic-link email quota,
  // Invitation expiry). Better Auth's own expiries (sessions, links, rate
  // limits) read the system clock.
  now?: () => Date;
};

const ANONYMOUS: Access = { kind: "anonymous" };

export function createAuth(deps: AuthDeps): Auth {
  return new BetterAuthModule(deps);
}

type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

class BetterAuthModule implements Auth {
  private readonly betterAuth: BetterAuthInstance;
  private readonly db: Db;
  private readonly adminEmail: string;
  private readonly trustForwardedFor: boolean;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  readonly #providers: ProviderRegistry;
  readonly #invitations: Invitations;
  readonly #roster: Roster;
  readonly #archive: ClientArchive;

  constructor(deps: AuthDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.adminEmail = deps.adminEmail.toLowerCase();
    this.trustForwardedFor = deps.trustForwardedFor;
    this.baseUrl = deps.baseUrl;
    this.#providers = deps.providers ?? {};
    this.betterAuth = createBetterAuth(deps, this.adminEmail, this.#providers);
    this.#invitations = new Invitations({
      db: deps.db,
      mailer: deps.mailer,
      adminEmail: this.adminEmail,
      baseUrl: deps.baseUrl,
      now: this.now,
    });
    this.#roster = new Roster(deps.db);
    this.#archive = new ClientArchive(deps.db, this.now);
  }

  async handler(request: Request): Promise<Response> {
    if (isOrganizationPath(request.url)) {
      return new Response("Not Found", { status: NOT_FOUND });
    }

    return this.betterAuth.handler(
      new Request(request, { headers: this.trustedHeaders(request) }),
    );
  }

  async getAccess(request: Request): Promise<AccessResult> {
    const { headers, response: current } = await this.betterAuth.api.getSession(
      {
        headers: this.trustedHeaders(request),
        returnHeaders: true,
      },
    );
    if (!current) return { access: ANONYMOUS, headers };

    const { id: userId, name } = current.user;
    const email = current.user.email.toLowerCase();
    const standing = await this.db.withSystem((tx) =>
      getStanding(tx, email, this.now(), this.adminEmail),
    );

    let access: Access;
    if (standing.kind === "admin") {
      const isPasskey = current.session.signInMethod === "passkey";
      access = { kind: isPasskey ? "admin" : "admin-needs-passkey", email };
    } else if (standing.kind === "member") {
      const { isArchived, ...membership } = standing.membership;
      access = isArchived
        ? { kind: "no-access", reason: "archived" }
        : { kind: "client", userId, email, name, ...membership };
    } else if (standing.kind === "invitee") {
      access = { kind: "invitee", userId, email };
    } else {
      access = { kind: "no-access", reason: "not-invited" };
    }
    return { access, headers };
  }

  listSocialProviders(): string[] {
    return Object.keys(this.#providers);
  }

  async signOut(request: Request): Promise<Headers> {
    const requestHeaders = this.trustedHeaders(request);
    // Better Auth only logs a failed delete and clears the cookie anyway,
    // which would leave the session usable by anyone holding the token. The
    // row goes first, so that failure throws instead.
    const current = await this.betterAuth.api.getSession({
      headers: requestHeaders,
      query: { disableRefresh: true },
    });
    if (current) await deleteSession(this.db, current.session.id);

    const { headers } = await this.betterAuth.api.signOut({
      headers: requestHeaders,
      returnHeaders: true,
    });
    return headers;
  }

  async listClients(): Promise<ClientSummary[]> {
    const now = this.now();
    const rows = await this.db.withSystem((tx) =>
      tx
        .select({
          id: clients.id,
          name: organization.name,
          createdAt: clients.createdAt,
          userCount: sql<number>`(select count(*)::int from ${member} where ${member.organizationId} = ${clients.id})`,
          ownerEmail: sql<string | null>`(
            select ${user.email} from ${member}
            join ${user} on ${user.id} = ${member.userId}
            where ${member.organizationId} = ${clients.id} and ${member.role} = 'owner'
            order by ${member.createdAt} asc, ${member.id} asc limit 1)`,
          hasLiveInvitation: sql<boolean>`exists (
            select 1 from ${invitation}
            where ${invitation.organizationId} = ${clients.id}
              and ${invitation.status} = 'pending'
              and ${gt(invitation.expiresAt, now)})`,
        })
        .from(clients)
        .innerJoin(organization, eq(organization.id, clients.id))
        .where(isNull(clients.archivedAt))
        .orderBy(asc(sql`lower(${organization.name})`), asc(clients.id)),
    );

    return rows.map(({ ownerEmail, hasLiveInvitation, ...row }) => ({
      ...row,
      owner: toOwner(ownerEmail, hasLiveInvitation),
    }));
  }

  async createClient(
    name: string,
  ): Promise<Result<{ clientId: string }, CreateClientError>> {
    if (getClientNameError(name) !== null) {
      console.warn("auth: refused a Client name (blank or too long)");
      return { value: null, error: "invalid-name", status: UNPROCESSABLE };
    }

    // Written directly, in the shape the organization plugin reads: its
    // createOrganization would make the Admin a member.
    const createdAt = this.now();
    try {
      const clientId = await this.db.withSystem(async (tx) => {
        const { rows } = await tx.execute<{ id: string }>(
          sql`select uuidv7() as id`,
        );
        const id = rows[0].id;
        await tx.insert(organization).values({
          id,
          name: normalizeClientName(name),
          slug: id,
          createdAt,
        });
        await tx.insert(clients).values({ id, createdAt });
        return id;
      });
      return { value: { clientId }, error: null, status: CREATED };
    } catch (error) {
      // The index, not a pre-check, so two racing creates can't both win.
      if (!isUniqueViolation(error, CLIENT_NAME_INDEX)) throw error;

      console.warn("auth: refused a Client name (already taken)");
      return { value: null, error: "duplicate-name", status: CONFLICT };
    }
  }

  async getTeam(clientId: string): Promise<Team | null> {
    if (!UUID_PATTERN.test(clientId)) return null;

    const now = this.now();
    const team = await this.db.withSystem(async (tx) => {
      const [client] = await tx
        .select({ name: organization.name, archivedAt: clients.archivedAt })
        .from(clients)
        .innerJoin(organization, eq(organization.id, clients.id))
        .where(eq(clients.id, clientId));
      if (!client) return null;

      const members = await tx
        .select({
          userId: member.userId,
          email: user.email,
          name: user.name,
          role: member.role,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, clientId))
        .orderBy(asc(member.createdAt), asc(member.id));
      const pendingInvitations = await tx
        .select({
          id: invitation.id,
          email: invitation.email,
          sentAt: invitation.createdAt,
          role: invitation.role,
        })
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, clientId),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, now),
          ),
        )
        .orderBy(desc(invitation.createdAt), desc(invitation.id));
      return { ...client, members, pendingInvitations };
    });
    if (team === null) return null;

    return {
      clientId,
      name: team.name,
      archivedAt: team.archivedAt,
      members: team.members.map((row) => ({
        ...row,
        role: row.role === "owner" ? "owner" : "member",
      })),
      pendingInvitations: team.pendingInvitations.map((row) => ({
        ...row,
        role: row.role === "owner" ? "owner" : "member",
      })),
      canInviteFirstOwner:
        team.archivedAt === null &&
        team.members.length === 0 &&
        team.pendingInvitations.length === 0,
    };
  }

  inviteFirstOwner(
    clientId: string,
    email: string,
  ): Promise<Result<Invitation, InviteError>> {
    return this.#invitations.inviteFirstOwner(clientId, email);
  }

  resendInvitation(
    clientId: string,
    invitationId: string,
  ): Promise<Result<Invitation, InvitationActionError>> {
    return this.#invitations.resend(clientId, invitationId);
  }

  revokeInvitation(
    clientId: string,
    invitationId: string,
  ): Promise<Result<null, InvitationActionError>> {
    return this.#invitations.revoke(clientId, invitationId);
  }

  async joinInvitation(
    request: Request,
    invitationId: string | null,
  ): Promise<Result<Joined, JoinError>> {
    if (invitationId !== null && !UUID_PATTERN.test(invitationId)) {
      return refuseJoin("not-found", null);
    }

    // Read only: getAccess has already slid the session for this request.
    const current = await this.betterAuth.api.getSession({
      headers: this.trustedHeaders(request),
      query: { disableRefresh: true },
    });
    const email = current?.user.email.normalize("NFC").toLowerCase();
    // The Admin belongs to no Client.
    if (!current || !email || email === this.adminEmail) {
      return refuseJoin("not-found", null);
    }

    const joiner = { userId: current.user.id, email };
    const outcome = await this.db.withSystem((tx) =>
      joinInvitation(tx, joiner, invitationId, this.now(), this.adminEmail),
    );
    if (typeof outcome === "string") return refuseJoin(outcome, invitationId);

    const { isNew, ...joined } = outcome;
    return { value: joined, error: null, status: isNew ? CREATED : OK };
  }

  async getLiveInvitation(
    invitationId: string,
  ): Promise<LiveInvitation | null> {
    if (!UUID_PATTERN.test(invitationId)) return null;

    const [row] = await this.db.withSystem((tx) =>
      tx
        .select({ email: invitation.email, clientName: organization.name })
        .from(invitation)
        .innerJoin(organization, eq(organization.id, invitation.organizationId))
        .where(
          and(
            eq(invitation.id, invitationId),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, this.now()),
          ),
        ),
    );
    return row ?? null;
  }

  async requestInvitationLink(
    request: Request,
    invitationId: string,
  ): Promise<Result<null, InvitationLinkError>> {
    const live = await this.getLiveInvitation(invitationId);
    if (live === null) return refuseInvitationLink("not-found");

    // Through the HTTP handler, as the sign-in screen's request goes, so the
    // per-IP rate limit and the send rules apply unchanged. The caller has
    // already checked the browser's request is same-origin.
    // The form POST's body headers don't describe the JSON body sent here.
    const headers = this.trustedHeaders(request);
    headers.delete("content-length");
    headers.set("origin", this.baseUrl);
    headers.set("content-type", "application/json");
    const response = await this.betterAuth.handler(
      new Request(`${this.baseUrl}${BASE_PATH}${MAGIC_LINK_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: live.email,
          callbackURL: `${INVITATION_PAGE_PREFIX}${invitationId}`,
          errorCallbackURL: MAGIC_LINK_ERROR_PATH,
        }),
      }),
    );

    let result: Result<null, InvitationLinkError> = {
      value: null,
      error: null,
      status: OK,
    };
    if (response.status === TOO_MANY_REQUESTS) {
      result = refuseInvitationLink("rate-limited");
    } else if (!response.ok) {
      console.error(
        `auth: invitation sign-in link request failed (${response.status})`,
      );
      result = { value: null, error: "failed", status: SERVER_ERROR };
    }
    return result;
  }

  inviteMember(
    access: ClientAccess,
    email: string,
  ): Promise<Result<Invitation, MemberInviteError>> {
    return this.#invitations.inviteMember(access, email);
  }

  resendMemberInvitation(
    access: ClientAccess,
    invitationId: string,
  ): Promise<Result<Invitation, MemberInvitationActionError>> {
    return this.#invitations.resendMember(access, invitationId);
  }

  revokeMemberInvitation(
    access: ClientAccess,
    invitationId: string,
  ): Promise<Result<null, MemberInvitationActionError>> {
    return this.#invitations.revokeMember(access, invitationId);
  }

  changeRole(
    actor: RosterActor,
    clientId: string,
    userId: string,
    role: Role,
  ): Promise<Result<null, RosterError>> {
    return this.#roster.changeRole(actor, clientId, userId, role);
  }

  removeMember(
    actor: RosterActor,
    clientId: string,
    userId: string,
  ): Promise<Result<null, RosterError>> {
    return this.#roster.removeMember(actor, clientId, userId);
  }

  leaveClient(access: ClientAccess): Promise<Result<null, RosterError>> {
    return this.#roster.leave(access);
  }

  archiveClient(clientId: string): Promise<Result<null, ArchiveError>> {
    return this.#archive.archive(clientId);
  }

  unarchiveClient(clientId: string): Promise<Result<null, ArchiveError>> {
    return this.#archive.unarchive(clientId);
  }

  listArchivedClients(): Promise<ArchivedClient[]> {
    return this.#archive.list();
  }

  getProfile(access: ClientAccess): Promise<Profile> {
    return this.db.withSystem(async (tx) => {
      const [stored] = await tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, access.userId));
      const [google] = await tx
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, access.userId),
            eq(account.providerId, GOOGLE_PROVIDER_ID),
          ),
        )
        .limit(1);
      const [counts] = await tx
        .select({
          owners: sql<number>`count(*) filter (where ${member.role} = 'owner')::int`,
          users: sql<number>`count(*)::int`,
        })
        .from(member)
        .where(eq(member.organizationId, access.clientId));

      let canLeave: Profile["canLeave"] = "yes";
      if (counts.users === 1) {
        canLeave = "only-user";
      } else if (access.role === "owner" && counts.owners === 1) {
        canLeave = "last-owner";
      }
      return {
        name: stored?.name ?? access.name,
        email: access.email,
        role: access.role,
        clientName: access.clientName,
        isGoogleLinked: google !== undefined,
        canLeave,
      };
    });
  }

  async updateDisplayName(
    access: ClientAccess,
    name: string,
  ): Promise<Result<null, "invalid-name">> {
    if (!isValidUserName(name)) {
      // The name stays out of the log: it is the user's own data.
      console.warn("auth: refused a display name", {
        clientId: access.clientId,
      });
      return { value: null, error: "invalid-name", status: UNPROCESSABLE };
    }

    const updated = await this.db.withSystem((tx) =>
      tx
        .update(user)
        .set({ name: normalizeUserName(name), updatedAt: this.now() })
        .where(eq(user.id, access.userId))
        .returning({ id: user.id }),
    );
    if (updated.length === 0) {
      throw new Error("auth: the display name's user no longer exists");
    }

    return { value: null, error: null, status: OK };
  }

  // Better Auth sees only the client IP this module trusts.
  private trustedHeaders(request: Request): Headers {
    return withClientIp(request.headers, this.trustForwardedFor);
  }
}

// Exported for tests only: /organization/* is closed over HTTP, so the
// native plugin endpoints (and the hooks wired to them) are reached through
// this instance's `api`. App code uses createAuth.
export function createBetterAuth(
  deps: AuthDeps,
  adminEmail: string,
  providers: ProviderRegistry,
) {
  const isAdminEmail = (email: string): boolean =>
    email.toLowerCase() === adminEmail;
  const now = deps.now ?? (() => new Date());
  const readStanding = (email: string): Promise<Standing> =>
    deps.db.withSystem((tx) => getStanding(tx, email, now(), adminEmail));
  const refuse = (reason: NoAccessReason): APIError =>
    createRefusal(deps.baseUrl, reason);
  const requireEligible = createInvitationEligibilityHook(deps.db, adminEmail);

  return betterAuth({
    appName: PASSKEY_RP_NAME,
    baseURL: deps.baseUrl,
    basePath: BASE_PATH,
    secret: deps.secret,
    trustedOrigins: [deps.baseUrl],
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,
    database: drizzleAdapter(deps.db.betterAuthDb, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
        passkey,
        organization,
        member,
        invitation,
        rateLimit,
      },
    }),
    advanced: {
      // Better Auth omits ids on insert; the uuidv7() column default fills
      // them.
      database: { generateId: "uuid" },
      // Set by the module from the IP it trusts (see client-ip.ts).
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_S,
      updateAge: SESSION_UPDATE_AGE_S,
      additionalFields: {
        signInMethod: { type: "string", required: true, input: false },
      },
    },
    socialProviders: getBuiltInProviders(providers, refuse),
    // A repeat sign-in would write fresh provider tokens back; none are kept.
    account: { updateAccountOnSignIn: false },
    rateLimit: {
      // Better Auth turns it off outside production unless told otherwise.
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/magic-link": MAGIC_LINK_RATE_LIMIT,
        "/magic-link/verify": MAGIC_LINK_RATE_LIMIT,
        "/passkey/generate-authenticate-options": PASSKEY_RATE_LIMIT,
        "/passkey/verify-authentication": PASSKEY_RATE_LIMIT,
        "/passkey/generate-register-options": PASSKEY_RATE_LIMIT,
        "/passkey/verify-registration": PASSKEY_RATE_LIMIT,
        [SOCIAL_SIGN_IN_PATH]: SOCIAL_RATE_LIMIT,
        // Matched against the real path (/callback/google), not the pattern.
        "/callback/*": SOCIAL_RATE_LIMIT,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === SOCIAL_SIGN_IN_PATH) {
          requireSocialRedirectSignIn(ctx.body, providers);
        }
        if (ctx.path === CALLBACK_PATH) {
          requireRegisteredProvider(ctx.params?.id, providers);
        }
        // Server-side auth.api calls come from this module and are trusted.
        if (!ctx.request || MAGIC_LINK_ADMIN_PATHS.has(ctx.path)) return;

        const current = await getSessionFromCtx(ctx);
        const isAdminMagicLink =
          current !== null &&
          "signInMethod" in current.session &&
          current.session.signInMethod === "magic-link" &&
          isAdminEmail(current.user.email);
        if (isAdminMagicLink) {
          console.warn("auth: refused a magic-link session's request", {
            path: ctx.path,
          });
          throw new APIError("FORBIDDEN", {
            message: "Register a passkey to continue",
          });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Nobody gets an account without a reason to have one: the Admin
          // (by magic link only) or a live, eligible Invitation.
          before: async (newUser, context) => {
            const signInMethod = getSignInMethod(context, providers);
            if (!signInMethod) return false;

            const standing = await readStanding(newUser.email);
            const isAllowed =
              standing.kind === "invitee" ||
              (standing.kind === "admin" && signInMethod === "magic-link");
            if (!isAllowed) {
              console.warn("auth: refused an account (not invited)", {
                signInMethod,
              });
              throw refuse("not-invited");
            }
            // A magic link has no name of its own: one sent in the request body is
            // the requester's claim, so it is dropped.
            // A provider's profile name is free text: it gets the Profile
            // form's rules. Either way an empty name (the email stands in)
            // rather than a refused sign-in.
            const isNamed =
              signInMethod !== "magic-link" && isValidUserName(newUser.name);
            const name = isNamed ? normalizeUserName(newUser.name) : "";
            return { data: { ...newUser, name } };
          },
        },
      },
      account: {
        create: {
          // A social sign-in links its provider account before the session
          // hook can refuse it, so the same standing check runs here first:
          // a refused user never gets the provider's account. Google is for
          // identity only (every token endpoint is disabled), so its tokens
          // are never stored.
          before: async (newAccount, context) => {
            const provider = Object.hasOwn(providers, newAccount.providerId)
              ? providers[newAccount.providerId]
              : null;
            if (provider === null || !context) return false;

            // Better Auth's adapter sees a user created earlier in this same
            // sign-in's transaction; the module's own pool wouldn't.
            const owner = await context.context.internalAdapter.findUserById(
              newAccount.userId,
            );
            if (!owner) return false;

            const standing = await readStanding(owner.email);
            const refusal = getSessionRefusal(standing, provider.signInMethod);
            if (refusal !== null) {
              console.warn(`auth: refused an account link (${refusal})`, {
                providerId: newAccount.providerId,
              });
              throw refuse(refusal);
            }
            return { data: { ...newAccount, ...NO_PROVIDER_TOKENS } };
          },
        },
      },
      session: {
        create: {
          before: async (newSession, context) => {
            const signInMethod = getSignInMethod(context, providers);
            if (!signInMethod) return false;

            const email = await findUserEmail(deps.db, newSession.userId);
            const standing = email === null ? null : await readStanding(email);
            const refusal = getSessionRefusal(standing, signInMethod);
            if (refusal !== null) {
              console.warn(`auth: refused a sign-in (${refusal})`, {
                signInMethod,
              });
              // A passkey ceremony is a JSON call: a 403, not a redirect.
              throw signInMethod === "passkey"
                ? new APIError("FORBIDDEN", { message: "No access" })
                : refuse(refusal);
            }
            return { data: { ...newSession, signInMethod } };
          },
          // A magic-link session exists only to register a passkey. Once a
          // passkey has signed in, none is left that could add another.
          after: async (created) => {
            if (created.signInMethod !== "passkey") return;

            await revokeMagicLinkSessions(deps.db, created.userId);
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRES_IN_S,
        storeToken: "hashed",
        // Everyone gets the same response at once: who is emailed is
        // decided after it, so neither the answer nor its timing reveals
        // who has an account or an Invitation.
        sendMagicLink: async ({ email, url }) => {
          const link = withSafeRedirects(url, deps.baseUrl);
          deps.runInBackground(
            sendMagicLinkIfAllowed(deps, readStanding, email, link, now()),
          );
        },
      }),
      passkeyPlugin({
        rpID: new URL(deps.baseUrl).hostname,
        rpName: PASSKEY_RP_NAME,
        origin: deps.baseUrl,
        authenticatorSelection: { userVerification: "required" },
        // The plugin verifies both ceremonies with user verification
        // optional (and asks for sign-in with "preferred"), so a passkey
        // proves presence and the user here, or it's refused.
        registration: {
          requireSession: true,
          afterVerification: ({ ctx, verification }) => {
            // Only the Admin's magic-link session (bootstrap and recovery)
            // adds passkeys: a stolen passkey session can't mint a lasting
            // one, and passkeys are the Admin's alone.
            const current = ctx.context.session;
            const isAdminMagicLink =
              current?.session.signInMethod === "magic-link" &&
              isAdminEmail(current.user.email);
            if (!isAdminMagicLink) {
              console.warn("auth: refused a passkey registration (session)");
              throw new APIError("FORBIDDEN", {
                message:
                  "Register a passkey from the Admin's magic-link session",
              });
            }
            requireUserVerified(verification.registrationInfo?.userVerified);
          },
        },
        authentication: {
          afterVerification: ({ verification }) =>
            requireUserVerified(verification.authenticationInfo.userVerified),
        },
      }),
      organizationPlugin({
        allowUserToCreateOrganization: false,
        invitationExpiresIn: INVITATION_EXPIRES_IN_S,
        // The module joins through joinInvitation (its own rows, under the
        // Client's lock); should the native acceptance ever run, it refuses
        // by the same rule.
        organizationHooks: {
          beforeCreateInvitation: requireEligible,
          beforeAcceptInvitation: requireEligible,
        },
        teams: { enabled: false },
      }),
      ...getCustomProviderPlugins(providers, refuse),
    ],
  });
}

type EndpointContext = {
  path?: string;
  params?: Record<string, string | undefined>;
} | null;

// The method the session being created will record, or null when its
// endpoint may not create one.
function getSignInMethod(
  context: EndpointContext,
  providers: ProviderRegistry,
): SignInMethod | null {
  if (!context?.path) return null;
  if (context.path !== CALLBACK_PATH) {
    return Object.hasOwn(SIGN_IN_METHOD_BY_PATH, context.path)
      ? SIGN_IN_METHOD_BY_PATH[context.path]
      : null;
  }

  const providerId = context.params?.id;
  return providerId !== undefined && Object.hasOwn(providers, providerId)
    ? providers[providerId].signInMethod
    : null;
}

// Why this user may not get a session by `signInMethod`, or null when they
// may. Null standing: the user row is gone.
function getSessionRefusal(
  standing: Standing | null,
  signInMethod: SignInMethod,
): NoAccessReason | null {
  let refusal: NoAccessReason | null = null;
  if (standing === null || standing.kind === "none") {
    refusal = "not-invited";
  } else if (standing.kind === "admin") {
    // The Admin proves themselves by magic link, then passkey; never by a
    // social provider.
    const isAdminMethod =
      signInMethod === "magic-link" || signInMethod === "passkey";
    refusal = isAdminMethod ? null : "not-invited";
  } else if (signInMethod === "passkey") {
    // Passkeys are the Admin's alone.
    refusal = "not-invited";
  } else if (standing.kind === "member" && standing.membership.isArchived) {
    refusal = "archived";
  }
  return refusal;
}

// A refused sign-in sends the browser to the No access page with its reason.
// Better Auth turns a thrown redirect into the response, from a database hook
// too: the OAuth callback and the magic-link verify both pass it through.
function createRefusal(baseUrl: string, reason: NoAccessReason): APIError {
  const location = `${baseUrl}${NO_ACCESS_PATH}?reason=${reason}`;
  return new APIError("FOUND", undefined, { location });
}

// Only a redirect sign-in with a registered provider: the id-token variant
// would skip the provider's own consent screen and callback.
function requireSocialRedirectSignIn(
  body: unknown,
  providers: ProviderRegistry,
): void {
  const fields: { provider?: unknown; idToken?: unknown } =
    typeof body === "object" && body !== null ? body : {};
  requireRegisteredProvider(fields.provider, providers);
  if (fields.idToken !== undefined) {
    console.warn("auth: refused an id-token social sign-in");
    throw new APIError("FORBIDDEN", { message: "Sign in with a redirect" });
  }
}

function requireRegisteredProvider(
  providerId: unknown,
  providers: ProviderRegistry,
): void {
  const isRegistered =
    typeof providerId === "string" && Object.hasOwn(providers, providerId);
  if (!isRegistered) {
    throw new APIError("NOT_FOUND", { message: "Provider not found" });
  }
}

// The registry's built-in providers, as Better Auth's socialProviders. Each
// must report a verified email, or the sign-in is refused.
function getBuiltInProviders(
  providers: ProviderRegistry,
  refuse: (reason: NoAccessReason) => APIError,
): SocialProviders {
  const socialProviders: SocialProviders = {};
  for (const [id, provider] of Object.entries(providers)) {
    if (provider.custom) continue;
    if (!isBuiltInProviderId(id)) {
      throw new Error(`auth: no built-in social provider "${id}"`);
    }

    socialProviders[id] = {
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      mapProfileToUser: (profile) => {
        requireVerifiedEmail(profile.email_verified === true, refuse);
        return {};
      },
    };
  }
  return socialProviders;
}

// The registry's custom providers, through Better Auth's generic OAuth, which
// serves them on the same /sign-in/social and /callback/:id endpoints.
function getCustomProviderPlugins(
  providers: ProviderRegistry,
  refuse: (reason: NoAccessReason) => APIError,
) {
  const config = Object.entries(providers).flatMap(([id, provider]) =>
    provider.custom
      ? [toGenericOAuthConfig(id, provider.clientId, provider.custom, refuse)]
      : [],
  );
  return config.length > 0 ? [genericOAuth({ config })] : [];
}

function toGenericOAuthConfig(
  providerId: string,
  clientId: string,
  custom: CustomOAuth,
  refuse: (reason: NoAccessReason) => APIError,
) {
  return {
    providerId,
    clientId,
    authorizationUrl: custom.authorizationUrl,
    getToken: ({ code }: { code: string }) => custom.getToken(code),
    getUserInfo: async ({ accessToken }: { accessToken?: string }) => {
      const profile = accessToken ? await custom.getProfile(accessToken) : null;
      if (!profile) return null;

      requireVerifiedEmail(profile.isEmailVerified, refuse);
      return {
        id: profile.id,
        email: profile.email,
        emailVerified: true,
        name: profile.name,
      };
    },
  };
}

function requireVerifiedEmail(
  isVerified: boolean,
  refuse: (reason: NoAccessReason) => APIError,
): void {
  if (isVerified) return;

  console.warn("auth: refused a social sign-in (email not verified)");
  throw refuse("not-invited");
}

// Under /api/auth/organization, however the path is spelled (case, repeated
// slashes, percent-encoding).
function isOrganizationPath(url: string): boolean {
  const { pathname } = new URL(url);
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes: Better Auth answers 404 for them anyway.
  }
  const path = decoded.replace(/\/{2,}/g, "/").toLowerCase();
  return (
    path === ORGANIZATION_PREFIX || path.startsWith(`${ORGANIZATION_PREFIX}/`)
  );
}

// `invitationId` is logged only once it's known to be a UUID.
function refuseJoin(
  error: JoinError,
  invitationId: string | null,
): Result<never, JoinError> {
  console.warn(`auth: refused a join (${error})`, { invitationId });
  return { value: null, error, status: JOIN_ERROR_STATUS[error] };
}

function refuseInvitationLink(
  error: Exclude<InvitationLinkError, "failed">,
): Result<never, InvitationLinkError> {
  const status = error === "not-found" ? NOT_FOUND : TOO_MANY_REQUESTS;
  console.warn(`auth: refused an invitation sign-in link (${error})`);
  return { value: null, error, status };
}

function toOwner(
  email: string | null,
  hasLiveInvitation: boolean,
): ClientSummary["owner"] {
  if (email !== null) return { email };

  return hasLiveInvitation ? { pending: true } : null;
}

// Drizzle wraps the driver's error in `cause`.
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const source = error instanceof Error ? (error.cause ?? error) : error;
  if (typeof source !== "object" || source === null) return false;

  return (
    "code" in source &&
    source.code === UNIQUE_VIOLATION &&
    "constraint" in source &&
    source.constraint === constraint
  );
}

function requireUserVerified(isUserVerified: boolean | undefined): void {
  if (isUserVerified) return;

  console.warn("auth: refused a passkey ceremony without user verification");
  throw new APIError("UNAUTHORIZED", {
    message: "The passkey must verify the user",
  });
}

async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.withSystem((tx) =>
    tx.delete(session).where(eq(session.id, sessionId)),
  );
}

async function revokeMagicLinkSessions(db: Db, userId: string): Promise<void> {
  await db.withSystem((tx) =>
    tx
      .delete(session)
      .where(
        and(eq(session.userId, userId), eq(session.signInMethod, "magic-link")),
      ),
  );
}

async function findUserEmail(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.withSystem((tx) =>
    tx.select({ email: user.email }).from(user).where(eq(user.id, userId)),
  );
  return row?.email ?? null;
}

// Who is emailed, the quota check and the send. Only the Admin, a Client User
// (of an archived Client too: the link then explains the refusal) or a live
// invitee gets a link. Catches everything: it runs after the response, so
// nothing else would see a failure.
async function sendMagicLinkIfAllowed(
  deps: AuthDeps,
  readStanding: (email: string) => Promise<Standing>,
  requestedEmail: string,
  url: string,
  now: Date,
): Promise<void> {
  try {
    const email = requestedEmail.normalize("NFC").toLowerCase();
    const standing = await readStanding(email);
    if (standing.kind === "none") return;

    const quotaKey = `magic-link:${email}`;
    const mayEmail = await deps.db.withSystem((tx) =>
      consumeEmailQuota(tx, quotaKey, now, MAGIC_LINK_EMAIL_QUOTA),
    );
    if (!mayEmail) {
      console.warn("auth: magic-link email skipped (hourly cap reached)");
      return;
    }
    await deps.mailer.send(buildMagicLinkEmail(email, url));
  } catch (error) {
    // No message text: provider errors can echo the address or the SMTP
    // user. The sign-in screen still says "check your email".
    console.error(`auth: magic-link email failed (${describeError(error)})`);
  }
}
