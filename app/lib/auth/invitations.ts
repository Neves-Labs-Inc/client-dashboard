import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { consumeEmailQuota, type EmailQuota } from "@/lib/auth/email-quota";
import {
  buildInvitationEmail,
  buildMemberInvitationEmail,
} from "@/lib/auth/emails";
import { getInviteIneligibility } from "@/lib/auth/invite-eligibility";
import type { Db, Tx } from "@/lib/db/db";
import {
  clients,
  invitation,
  member,
  organization,
  user,
} from "@/lib/db/schema";
import { describeError } from "@/lib/describe-error";
import { getSenderLabel } from "@/lib/display-name";
import type { Mailer, MailMessage } from "@/lib/mailer/mailer";
import { normalizeInviteEmail } from "@/lib/invite-email";
import type { Result } from "@/lib/result";

// Every Invitation the portal sends: the Admin's first-Owner ones and
// Owners' Member ones. Both are written here, in the organization plugin's
// exact shape, inside one transaction that holds the Client's row lock and
// re-checks every rule. Better Auth's createInvitation can't join that
// transaction (it runs on its own adapter), and the Admin isn't a member it
// would accept as inviter. The native acceptInvitation works on these rows
// unchanged.

const DAY_S = 24 * 60 * 60;
export const INVITATION_EXPIRES_IN_S = 7 * DAY_S;
const INVITATION_EXPIRES_IN_MS = INVITATION_EXPIRES_IN_S * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OK = 200;
const CREATED = 201;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const TOO_MANY_REQUESTS = 429;
const HOUR_MS = 60 * 60 * 1000;
// Per address, invites and resends together, whoever sends them: a resend
// loop (or an invite → revoke → invite one) can't flood an inbox or spend
// the Gmail sending quota that magic links share.
const INVITATION_EMAIL_QUOTA: EmailQuota = { windowMs: HOUR_MS, max: 5 };
// The Admin's invitation email, whatever the address: Gmail's dot, plus and
// googlemail variants each pass the per-address cap, and the SMTP quota
// that magic-link recovery needs must survive a stolen Admin session.
// Magic links keep their own `magic-link:` keys.
const ALL_INVITATIONS_QUOTA: EmailQuota = { windowMs: HOUR_MS, max: 20 };
const ALL_INVITATIONS_KEY = "invitation:*";
// One Client's Owners together. Kept apart from the Admin's global cap, so
// a Client's Owners can't lock the Admin out of inviting.
const CLIENT_INVITATIONS_QUOTA: EmailQuota = { windowMs: HOUR_MS, max: 20 };

type AdminQuotaRefusal = "too-many-emails" | "too-many-invitations";
type OwnerQuotaRefusal = "too-many-emails" | "too-many-for-client";

export type Invitation = { id: string; email: string; sentAt: Date };

export type InviteError =
  | "invalid-email"
  | "client-not-found"
  | "archived"
  | "admin-email"
  | "other-client"
  | "not-first-owner"
  | "pending-exists"
  | AdminQuotaRefusal;

// not-found: no live (pending, unexpired) invitation of this Client has
// that id. archived: the Client is archived. too-many-emails: its address
// hit the hourly email cap. too-many-invitations: all the Admin's
// invitation email hit its cap.
export type InvitationActionError =
  "not-found" | "archived" | AdminQuotaRefusal;

// forbidden: the inviter isn't (or is no longer) an Owner of an active
// Client. ineligible: ADMIN_EMAIL or another Client's user, one code so an
// Owner can't probe which. too-many-for-client: the Client's Owners hit
// their hourly cap.
export type MemberInviteError =
  | "forbidden"
  | "invalid-email"
  | "ineligible"
  | "already-member"
  | "pending-exists"
  | OwnerQuotaRefusal;

export type MemberInvitationActionError =
  "forbidden" | "not-found" | OwnerQuotaRefusal;

// The Client User acting: a client access (ClientAccess) fits.
export type ClientActor = {
  userId: string;
  clientId: string;
  role: "owner" | "member";
};

const INVITE_ERROR_STATUS: Record<InviteError, number> = {
  "invalid-email": UNPROCESSABLE,
  "client-not-found": NOT_FOUND,
  archived: FORBIDDEN,
  "admin-email": UNPROCESSABLE,
  "other-client": CONFLICT,
  "not-first-owner": CONFLICT,
  "pending-exists": CONFLICT,
  "too-many-emails": TOO_MANY_REQUESTS,
  "too-many-invitations": TOO_MANY_REQUESTS,
};

const MEMBER_INVITE_ERROR_STATUS: Record<MemberInviteError, number> = {
  forbidden: FORBIDDEN,
  "invalid-email": UNPROCESSABLE,
  ineligible: UNPROCESSABLE,
  "already-member": CONFLICT,
  "pending-exists": CONFLICT,
  "too-many-emails": TOO_MANY_REQUESTS,
  "too-many-for-client": TOO_MANY_REQUESTS,
};

const ACTION_ERROR_STATUS: Record<
  InvitationActionError | MemberInvitationActionError,
  number
> = {
  forbidden: FORBIDDEN,
  "not-found": NOT_FOUND,
  archived: FORBIDDEN,
  "too-many-emails": TOO_MANY_REQUESTS,
  "too-many-invitations": TOO_MANY_REQUESTS,
  "too-many-for-client": TOO_MANY_REQUESTS,
};

// Counts one email against the sender's caps: null when it may go out.
type ConsumeQuota<R extends string> = (
  tx: Tx,
  email: string,
  now: Date,
) => Promise<R | null>;

type InvitationsDeps = {
  db: Db;
  mailer: Mailer;
  // Lowercase.
  adminEmail: string;
  baseUrl: string;
  now: () => Date;
};

// What a saved row needs to be emailed: the copy follows its role, and a
// Member invitation names who sent it (name and email, or the email).
type SavedInvitation = Invitation & {
  clientName: string;
  role: string | null;
  inviterName: string;
};

export class Invitations {
  readonly #db: Db;
  readonly #mailer: Mailer;
  readonly #adminEmail: string;
  readonly #baseUrl: string;
  readonly #now: () => Date;

  constructor(deps: InvitationsDeps) {
    this.#db = deps.db;
    this.#mailer = deps.mailer;
    this.#adminEmail = deps.adminEmail;
    this.#baseUrl = deps.baseUrl;
    this.#now = deps.now;
  }

  async inviteFirstOwner(
    clientId: string,
    rawEmail: string,
  ): Promise<Result<Invitation, InviteError>> {
    const email = normalizeInviteEmail(rawEmail);
    if (email === null) return refuseInvite("invalid-email", null);
    if (!UUID_PATTERN.test(clientId)) {
      return refuseInvite("client-not-found", null);
    }

    const now = this.#now();
    // One transaction holding the Client's row lock: two racing invites
    // run one after the other, so the second sees the first's row.
    const outcome = await this.#db.withSystem(
      async (tx): Promise<SavedInvitation | InviteError> => {
        const [client] = await tx
          .select({ name: organization.name, archivedAt: clients.archivedAt })
          .from(clients)
          .innerJoin(organization, eq(organization.id, clients.id))
          .where(eq(clients.id, clientId))
          .for("update", { of: clients });
        if (!client) return "client-not-found";
        if (client.archivedAt !== null) return "archived";

        const reason =
          (await getInviteIneligibility(
            tx,
            { clientId, email },
            this.#adminEmail,
          )) ?? (await getSlotRefusal(tx, clientId, now));
        if (reason !== null) return reason;
        const quotaRefusal = await consumeAdminQuota(tx, email, now);
        if (quotaRefusal !== null) return quotaRefusal;

        const saved = await insertInvitation(tx, {
          clientId,
          email,
          role: "owner",
          inviterId: await getAdminUserId(tx, this.#adminEmail),
          now,
        });
        return { ...saved, clientName: client.name, inviterName: "" };
      },
    );
    if (typeof outcome === "string") return refuseInvite(outcome, clientId);

    await this.#email(outcome, clientId);
    return { value: toInvitation(outcome), error: null, status: CREATED };
  }

  // An Owner's invitation: always a Member, to the Owner's own Client.
  async inviteMember(
    actor: ClientActor,
    rawEmail: string,
  ): Promise<Result<Invitation, MemberInviteError>> {
    const { clientId } = actor;
    if (actor.role !== "owner") return refuseMemberInvite("forbidden", actor);
    const email = normalizeInviteEmail(rawEmail);
    if (email === null) return refuseMemberInvite("invalid-email", actor);

    const now = this.#now();
    // As inviteFirstOwner: the Client's row lock makes racing invites to
    // one email save one row.
    const outcome = await this.#db.withSystem(
      async (tx): Promise<SavedInvitation | MemberInviteError> => {
        const owner = await lockOwnersClient(tx, actor);
        if (owner === null) return "forbidden";

        const reason =
          (await getMemberInviteRefusal(
            tx,
            { clientId, email },
            this.#adminEmail,
          )) ?? (await getPendingRefusal(tx, clientId, email, now));
        if (reason !== null) return reason;
        const quotaRefusal = await consumeOwnerQuota(clientId)(tx, email, now);
        if (quotaRefusal !== null) return quotaRefusal;

        const saved = await insertInvitation(tx, {
          clientId,
          email,
          role: "member",
          inviterId: actor.userId,
          now,
        });
        return { ...saved, ...owner };
      },
    );
    if (typeof outcome === "string") return refuseMemberInvite(outcome, actor);

    await this.#email(outcome, clientId);
    return { value: toInvitation(outcome), error: null, status: CREATED };
  }

  // The Admin's resend of any live invitation of the Client. Same id, so
  // the same link, with a fresh 7 days.
  async resend(
    clientId: string,
    invitationId: string,
  ): Promise<Result<Invitation, InvitationActionError>> {
    if (!isUuid(clientId, invitationId)) {
      return refuseAction("resend", "not-found");
    }

    const outcome = await this.#db.withSystem(
      async (tx): Promise<SavedInvitation | InvitationActionError> => {
        const refusal = await lockActiveClient(tx, clientId);
        if (refusal !== null) return refusal;

        return this.#renew(
          tx,
          { clientId, role: null },
          invitationId,
          consumeAdminQuota,
        );
      },
    );
    if (typeof outcome === "string") return refuseAction("resend", outcome);

    await this.#email(outcome, clientId);
    return { value: toInvitation(outcome), error: null, status: OK };
  }

  // An Owner's resend of a live Member invitation of their own Client.
  async resendMember(
    actor: ClientActor,
    invitationId: string,
  ): Promise<Result<Invitation, MemberInvitationActionError>> {
    const { clientId } = actor;
    if (actor.role !== "owner") return refuseAction("resend", "forbidden");
    if (!isUuid(invitationId)) return refuseAction("resend", "not-found");

    const outcome = await this.#db.withSystem(
      async (tx): Promise<SavedInvitation | MemberInvitationActionError> => {
        if ((await lockOwnersClient(tx, actor)) === null) return "forbidden";

        return this.#renew(
          tx,
          { clientId, role: "member" },
          invitationId,
          consumeOwnerQuota(clientId),
        );
      },
    );
    if (typeof outcome === "string") return refuseAction("resend", outcome);

    await this.#email(outcome, clientId);
    return { value: toInvitation(outcome), error: null, status: OK };
  }

  // The Admin's revoke of any live invitation of the Client.
  async revoke(
    clientId: string,
    invitationId: string,
  ): Promise<Result<null, InvitationActionError>> {
    if (!isUuid(clientId, invitationId)) {
      return refuseAction("revoke", "not-found");
    }

    const now = this.#now();
    const outcome = await this.#db.withSystem(
      async (tx): Promise<InvitationActionError | null> => {
        const refusal = await lockActiveClient(tx, clientId);
        if (refusal !== null) return refusal;

        const scope = { clientId, role: null };
        const isCanceled = await cancelInvitation(tx, scope, invitationId, now);
        return isCanceled ? null : "not-found";
      },
    );
    if (outcome !== null) return refuseAction("revoke", outcome);

    return { value: null, error: null, status: OK };
  }

  // An Owner's revoke of a live Member invitation of their own Client.
  async revokeMember(
    actor: ClientActor,
    invitationId: string,
  ): Promise<Result<null, MemberInvitationActionError>> {
    if (actor.role !== "owner") return refuseAction("revoke", "forbidden");
    if (!isUuid(invitationId)) return refuseAction("revoke", "not-found");

    const now = this.#now();
    const outcome = await this.#db.withSystem(
      async (tx): Promise<MemberInvitationActionError | null> => {
        if ((await lockOwnersClient(tx, actor)) === null) return "forbidden";

        const isCanceled = await cancelInvitation(
          tx,
          { clientId: actor.clientId, role: "member" },
          invitationId,
          now,
        );
        return isCanceled ? null : "not-found";
      },
    );
    if (outcome !== null) return refuseAction("revoke", outcome);

    return { value: null, error: null, status: OK };
  }

  // Locks a live invitation in `scope`, counts the email against the
  // sender's caps and gives it 7 more days.
  async #renew<R extends string>(
    tx: Tx,
    scope: InvitationScope,
    invitationId: string,
    consumeQuota: ConsumeQuota<R>,
  ): Promise<SavedInvitation | R | "not-found"> {
    const now = this.#now();
    const [row] = await tx
      .select({
        id: invitation.id,
        email: invitation.email,
        sentAt: invitation.createdAt,
        role: invitation.role,
        clientName: organization.name,
        inviterName: user.name,
        inviterEmail: user.email,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .innerJoin(user, eq(user.id, invitation.inviterId))
      .where(isLive(scope, invitationId, now))
      .for("update", { of: invitation });
    if (!row) return "not-found";
    const quotaRefusal = await consumeQuota(tx, row.email, now);
    if (quotaRefusal !== null) return quotaRefusal;

    await tx
      .update(invitation)
      .set({ expiresAt: new Date(now.getTime() + INVITATION_EXPIRES_IN_MS) })
      .where(eq(invitation.id, row.id));
    const { inviterName, inviterEmail, ...saved } = row;
    return { ...saved, inviterName: getSenderLabel(inviterName, inviterEmail) };
  }

  // The row is saved either way: a failed send is logged and the sender
  // can resend. The log line carries no address, link or provider message.
  async #email(saved: SavedInvitation, clientId: string): Promise<void> {
    try {
      await this.#mailer.send(this.#buildEmail(saved));
    } catch (error) {
      console.error(`auth: invitation email failed (${describeError(error)})`, {
        clientId,
      });
    }
  }

  #buildEmail(saved: SavedInvitation): MailMessage {
    const url = `${this.#baseUrl}/invitations/${saved.id}`;
    return saved.role === "owner"
      ? buildInvitationEmail(saved.email, saved.clientName, url)
      : buildMemberInvitationEmail(
          saved.email,
          saved.clientName,
          saved.inviterName,
          url,
        );
  }
}

type NewInvitation = {
  clientId: string;
  email: string;
  role: "owner" | "member";
  inviterId: string;
  now: Date;
};

async function insertInvitation(
  tx: Tx,
  { clientId, email, role, inviterId, now }: NewInvitation,
): Promise<Invitation & { role: string | null }> {
  const [saved] = await tx
    .insert(invitation)
    .values({
      organizationId: clientId,
      email,
      role,
      status: "pending",
      expiresAt: new Date(now.getTime() + INVITATION_EXPIRES_IN_MS),
      createdAt: now,
      inviterId,
    })
    .returning({
      id: invitation.id,
      email: invitation.email,
      sentAt: invitation.createdAt,
      role: invitation.role,
    });
  return saved;
}

// Locks the Client's row for the Admin's resend or revoke, before the
// invitation's (the order archiving takes): null when it's there and active.
async function lockActiveClient(
  tx: Tx,
  clientId: string,
): Promise<"not-found" | "archived" | null> {
  const [client] = await tx
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, clientId))
    .for("update");
  if (!client) return "not-found";

  return client.archivedAt === null ? null : "archived";
}

// Locks the actor's Client row when they are still an Owner of it and it's
// still active (access is read per request, so a demotion or an archive may
// have landed since). Their Client's name and their display name, or null.
async function lockOwnersClient(
  tx: Tx,
  actor: ClientActor,
): Promise<{ clientName: string; inviterName: string } | null> {
  const [row] = await tx
    .select({
      clientName: organization.name,
      name: user.name,
      email: user.email,
    })
    .from(clients)
    .innerJoin(organization, eq(organization.id, clients.id))
    .innerJoin(member, eq(member.organizationId, clients.id))
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(clients.id, actor.clientId),
        isNull(clients.archivedAt),
        eq(member.userId, actor.userId),
        eq(member.role, "owner"),
      ),
    )
    .for("update", { of: clients });
  if (!row) return null;

  return {
    clientName: row.clientName,
    inviterName: getSenderLabel(row.name, row.email),
  };
}

// ineligible (ADMIN_EMAIL or another Client's user) before already-member.
async function getMemberInviteRefusal(
  tx: Tx,
  invitee: { clientId: string; email: string },
  adminEmail: string,
): Promise<"ineligible" | "already-member" | null> {
  if ((await getInviteIneligibility(tx, invitee, adminEmail)) !== null) {
    return "ineligible";
  }

  const [teammate] = await tx
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, invitee.clientId),
        eq(sql`lower(${user.email})`, invitee.email),
      ),
    )
    .limit(1);
  return teammate ? "already-member" : null;
}

// A live pending invitation to this email for this Client.
async function getPendingRefusal(
  tx: Tx,
  clientId: string,
  email: string,
  now: Date,
): Promise<"pending-exists" | null> {
  const [live] = await tx
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, clientId),
        eq(invitation.email, email),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .limit(1);
  return live ? "pending-exists" : null;
}

// not-first-owner when the Client has any member; pending-exists when it
// already has a live pending invitation.
async function getSlotRefusal(
  tx: Tx,
  clientId: string,
  now: Date,
): Promise<"not-first-owner" | "pending-exists" | null> {
  const [anyMember] = await tx
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, clientId))
    .limit(1);
  if (anyMember) return "not-first-owner";

  const [liveInvitation] = await tx
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, clientId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .limit(1);
  return liveInvitation ? "pending-exists" : null;
}

// The inviter. The Admin is signed in to get here, so the row exists.
async function getAdminUserId(tx: Tx, adminEmail: string): Promise<string> {
  const [admin] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, adminEmail));
  if (!admin) throw new Error("auth: the Admin has no user row");

  return admin.id;
}

// Cancels a live invitation in `scope`; false when there was none.
async function cancelInvitation(
  tx: Tx,
  scope: InvitationScope,
  invitationId: string,
  now: Date,
): Promise<boolean> {
  const rows = await tx
    .update(invitation)
    .set({ status: "canceled" })
    .where(isLive(scope, invitationId, now))
    .returning({ id: invitation.id });
  return rows.length > 0;
}

// Which live invitations of a Client an action may touch: the Admin's reach
// every role; an Owner's only Member ones (Franklin, ticket 04 gate).
type InvitationScope = { clientId: string; role: "member" | null };

// A live invitation in `scope`.
function isLive(scope: InvitationScope, invitationId: string, now: Date) {
  return and(
    eq(invitation.id, invitationId),
    eq(invitation.organizationId, scope.clientId),
    scope.role === null ? undefined : eq(invitation.role, scope.role),
    eq(invitation.status, "pending"),
    gt(invitation.expiresAt, now),
  );
}

function toInvitation({ id, email, sentAt }: Invitation): Invitation {
  return { id, email, sentAt };
}

// `clientId` only once it's known to be a UUID: the log never echoes
// arbitrary input.
function refuseInvite(
  error: InviteError,
  clientId: string | null,
): Result<Invitation, InviteError> {
  const status = INVITE_ERROR_STATUS[error];
  // An email-free line: the address is the invitee's personal data.
  console.warn(`auth: refused a first-Owner invitation (${error})`, {
    clientId,
  });
  return { value: null, error, status };
}

function refuseMemberInvite(
  error: MemberInviteError,
  actor: ClientActor,
): Result<Invitation, MemberInviteError> {
  const status = MEMBER_INVITE_ERROR_STATUS[error];
  console.warn(`auth: refused a Member invitation (${error})`, {
    clientId: actor.clientId,
  });
  return { value: null, error, status };
}

function refuseAction<
  E extends InvitationActionError | MemberInvitationActionError,
>(action: "resend" | "revoke", error: E): Result<never, E> {
  const status = ACTION_ERROR_STATUS[error];
  console.warn(`auth: refused to ${action} an invitation (${error})`);
  return { value: null, error, status };
}

function isUuid(...values: string[]): boolean {
  return values.every((value) => UUID_PATTERN.test(value));
}

// Counts one Admin invitation email, per address (so every invitation to
// the same person, from the Admin or an Owner, shares the cap) and against
// the Admin's global cap. Null when it may go out.
function consumeAdminQuota(
  tx: Tx,
  email: string,
  now: Date,
): Promise<AdminQuotaRefusal | null> {
  return consumeQuotas(tx, now, [
    addressCap(email),
    {
      key: ALL_INVITATIONS_KEY,
      quota: ALL_INVITATIONS_QUOTA,
      refusal: "too-many-invitations",
    },
  ]);
}

// The same for an Owner's email: per address, then the Client's own cap.
function consumeOwnerQuota(
  clientId: string,
): (tx: Tx, email: string, now: Date) => Promise<OwnerQuotaRefusal | null> {
  return (tx, email, now) =>
    consumeQuotas(tx, now, [
      addressCap(email),
      {
        key: `invitation-client:${clientId}`,
        quota: CLIENT_INVITATIONS_QUOTA,
        refusal: "too-many-for-client",
      },
    ]);
}

type QuotaCap<R extends string> = {
  key: string;
  quota: EmailQuota;
  refusal: R;
};

function addressCap(email: string): QuotaCap<"too-many-emails"> {
  return {
    key: `invitation:${email}`,
    quota: INVITATION_EMAIL_QUOTA,
    refusal: "too-many-emails",
  };
}

// Thrown inside the savepoint to roll back the counts it made.
class QuotaRefused<R extends string> extends Error {
  constructor(readonly refusal: R) {
    super(`quota refused (${refusal})`);
  }
}

// Counts one email against each cap in order; the first cap it would go
// over is the refusal. Under a savepoint, so a refused email spends no
// count on any cap (an Owner at their Client's cap can't use up an
// address's slots without sending).
async function consumeQuotas<R extends string>(
  tx: Tx,
  now: Date,
  caps: QuotaCap<R>[],
): Promise<R | null> {
  let refusal: R | null = null;
  try {
    await tx.transaction(async (savepoint) => {
      for (const cap of caps) {
        const isUnderCap = await consumeEmailQuota(
          savepoint,
          cap.key,
          now,
          cap.quota,
        );
        if (!isUnderCap) throw new QuotaRefused(cap.refusal);
      }
    });
  } catch (error) {
    if (!(error instanceof QuotaRefused)) throw error;
    refusal = error.refusal as R;
  }
  return refusal;
}
