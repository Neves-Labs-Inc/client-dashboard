import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import {
  magicLink,
  organization as organizationPlugin,
} from "better-auth/plugins";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { CLIENT_IP_HEADER, withClientIp } from "@/lib/auth/client-ip";
import { buildMagicLinkEmail } from "@/lib/auth/emails";
import { getClientNameError, normalizeClientName } from "@/lib/client-name";
import type { Db } from "@/lib/db/db";
import {
  account,
  clients,
  emailSendQuota,
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
const INVITATION_EXPIRES_IN_S = 7 * DAY_S;
const MAGIC_LINK_RATE_LIMIT = { window: 60, max: 5 };
// Each options request writes a challenge row, and sign-in options need no
// session, so these are capped well under Better Auth's 100 per 10 s.
const PASSKEY_RATE_LIMIT = { window: 60, max: 10 };
// On top of the per-IP limit: rotating IPs still can't send ADMIN_EMAIL more
// than this many links an hour (mail-bombing, Gmail's daily sending cap).
const MAGIC_LINK_EMAIL_QUOTA = { windowMs: HOUR_MS, max: 10 };
const PASSKEY_RP_NAME = "Neves Labs portal";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const CLIENT_NAME_INDEX = "organization_name_lower_key";
const CREATED = 201;
const UNPROCESSABLE = 422;
const CONFLICT = 409;

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

// The endpoints allowed to create a session, and the sign-in method each
// records. Any other path (e.g. passkey registration with createSession) is
// refused, so every session says how it was proven.
const SIGN_IN_METHOD_BY_PATH: Record<string, SignInMethod> = {
  "/magic-link/verify": "magic-link",
  "/passkey/verify-authentication": "passkey",
};

export type Access =
  | { kind: "anonymous" }
  // A magic-link session: it may only register a passkey.
  | { kind: "admin-needs-passkey"; email: string }
  // A passkey session: the Admin area.
  | { kind: "admin"; email: string };

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

export type TeamMember = {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "member";
};

export type PendingInvitation = { id: string; email: string; sentAt: Date };

export type Team = {
  clientId: string;
  name: string;
  // Oldest first.
  members: TeamMember[];
  // Live only (pending and unexpired), newest first.
  pendingInvitations: PendingInvitation[];
  // No members and no live pending invitation.
  canInviteFirstOwner: boolean;
};

export type Auth = {
  // Better Auth's HTTP handler, mounted at /api/auth/*.
  handler(request: Request): Promise<Response>;
  getAccess(request: Request): Promise<AccessResult>;
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
};

type AuthDeps = {
  db: Db;
  mailer: Mailer;
  adminEmail: string;
  // BETTER_AUTH_URL: an origin with no trailing slash.
  baseUrl: string;
  secret: string;
  // True only on Vercel, which overwrites X-Forwarded-For with the client
  // IP. Elsewhere the header is client-controlled and ignored.
  trustForwardedFor: boolean;
  // Runs the Admin's magic-link quota check and send after the response
  // instead of before it (Vercel's waitUntil in production). The task never
  // rejects.
  runInBackground: (task: Promise<void>) => void;
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

class BetterAuthModule implements Auth {
  private readonly betterAuth: BetterAuthInstance;
  private readonly db: Db;
  private readonly adminEmail: string;
  private readonly trustForwardedFor: boolean;
  private readonly now: () => Date;

  constructor(deps: AuthDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.adminEmail = deps.adminEmail.toLowerCase();
    this.trustForwardedFor = deps.trustForwardedFor;
    this.betterAuth = createBetterAuth(deps, this.adminEmail);
  }

  handler(request: Request): Promise<Response> {
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

    const email = current.user.email.toLowerCase();
    if (email !== this.adminEmail) return { access: ANONYMOUS, headers };

    const isPasskey = current.session.signInMethod === "passkey";
    const kind = isPasskey ? "admin" : "admin-needs-passkey";
    return { access: { kind, email }, headers };
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
        .select({ name: organization.name })
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
      return { name: client.name, members, pendingInvitations };
    });
    if (team === null) return null;

    return {
      clientId,
      name: team.name,
      members: team.members.map((row) => ({
        ...row,
        role: row.role === "owner" ? "owner" : "member",
      })),
      pendingInvitations: team.pendingInvitations,
      canInviteFirstOwner:
        team.members.length === 0 && team.pendingInvitations.length === 0,
    };
  }

  // Better Auth sees only the client IP this module trusts.
  private trustedHeaders(request: Request): Headers {
    return withClientIp(request.headers, this.trustForwardedFor);
  }
}

function createBetterAuth(deps: AuthDeps, adminEmail: string) {
  const isAdminEmail = (email: string): boolean =>
    email.toLowerCase() === adminEmail;
  const now = deps.now ?? (() => new Date());

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
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Only the Admin has an account in Phase 2, so no other email ever
          // gets one, whatever endpoint is reached.
          before: async (newUser) => isAdminEmail(newUser.email),
        },
      },
      session: {
        create: {
          before: async (newSession, context) => {
            const signInMethod = context
              ? SIGN_IN_METHOD_BY_PATH[context.path]
              : undefined;
            if (!signInMethod) return false;

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
        // Any other email, or the Admin's past the hourly cap, gets the same
        // response and no email, so the portal reveals nothing.
        sendMagicLink: async ({ email, url }) => {
          if (!isAdminEmail(email)) return;

          // Not awaited: the Admin's request must answer as fast as any
          // other, or its timing reveals ADMIN_EMAIL.
          deps.runInBackground(
            sendAdminMagicLink(deps, adminEmail, url, now()),
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
            // Only the magic-link session (bootstrap and recovery) adds
            // passkeys: a stolen passkey session can't mint a lasting one.
            const method = ctx.context.session?.session.signInMethod;
            if (method !== "magic-link") {
              console.warn("auth: refused a passkey registration (method)");
              throw new APIError("FORBIDDEN", {
                message: "Register a passkey from a magic-link session",
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
        teams: { enabled: false },
      }),
    ],
  });
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

// The quota check and the send. Catches everything: it runs after the
// response, so nothing else would see a failure.
async function sendAdminMagicLink(
  deps: AuthDeps,
  adminEmail: string,
  url: string,
  now: Date,
): Promise<void> {
  try {
    const quotaKey = `magic-link:${adminEmail}`;
    if (!(await consumeEmailQuota(deps.db, quotaKey, now))) {
      console.warn("auth: magic-link email skipped (hourly cap reached)");
      return;
    }
    await deps.mailer.send(buildMagicLinkEmail(adminEmail, url));
  } catch (error) {
    // No message text: provider errors can echo the address or the SMTP
    // user. The sign-in screen still says "check your email".
    console.error(
      `auth: magic-link email failed (${describeMailError(error)})`,
    );
  }
}

// Counts one email against `key`'s fixed one-hour window and says whether it
// may go out. A single upsert, so concurrent requests can't both slip under
// the cap.
async function consumeEmailQuota(
  db: Db,
  key: string,
  now: Date,
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - MAGIC_LINK_EMAIL_QUOTA.windowMs);
  const isWindowOver = sql`${emailSendQuota.windowStartedAt} <= ${windowStart}`;
  const [row] = await db.withSystem((tx) =>
    tx
      .insert(emailSendQuota)
      .values({ key, windowStartedAt: now, count: 1 })
      .onConflictDoUpdate({
        target: emailSendQuota.key,
        set: {
          windowStartedAt: sql`case when ${isWindowOver} then excluded.window_started_at else ${emailSendQuota.windowStartedAt} end`,
          count: sql`case when ${isWindowOver} then 1 else ${emailSendQuota.count} + 1 end`,
        },
      })
      .returning({ count: emailSendQuota.count }),
  );
  return row.count <= MAGIC_LINK_EMAIL_QUOTA.max;
}

// The error's name and code (e.g. "Error ECONNREFUSED"), never its message.
function describeMailError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";

  const code = "code" in error ? ` ${String(error.code)}` : "";
  return `${error.name}${code}`;
}
