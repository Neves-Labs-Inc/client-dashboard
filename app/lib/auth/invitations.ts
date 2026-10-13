import { and, eq, gt, sql } from "drizzle-orm";
import { consumeEmailQuota, type EmailQuota } from "@/lib/auth/email-quota";
import { buildInvitationEmail } from "@/lib/auth/emails";
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
import type { Mailer } from "@/lib/mailer/mailer";
import { normalizeInviteEmail } from "@/lib/invite-email";
import type { Result } from "@/lib/result";

// The Admin's first-Owner invitations. The Admin belongs to no Client, and
// Better Auth's createInvitation needs a member inviter, so the rows are
// written here, in the organization plugin's exact shape: Phase 3's native
// acceptInvitation works on them unchanged.

const DAY_S = 24 * 60 * 60;
export const INVITATION_EXPIRES_IN_S = 7 * DAY_S;
const INVITATION_EXPIRES_IN_MS = INVITATION_EXPIRES_IN_S * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OK = 200;
const CREATED = 201;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const TOO_MANY_REQUESTS = 429;
const HOUR_MS = 60 * 60 * 1000;
// Per address, invites and resends together: a resend loop (or an
// invite → revoke → invite one) can't flood an inbox or spend the Gmail
// sending quota that magic links share.
const INVITATION_EMAIL_QUOTA: EmailQuota = { windowMs: HOUR_MS, max: 5 };
// Every invitation email, whatever the address: Gmail's dot, plus and
// googlemail variants each pass the per-address cap, and the SMTP quota
// that magic-link recovery needs must survive a stolen Admin session.
// Magic links keep their own `magic-link:` keys.
const ALL_INVITATIONS_QUOTA: EmailQuota = { windowMs: HOUR_MS, max: 20 };
const ALL_INVITATIONS_KEY = "invitation:*";

type QuotaRefusal = "too-many-emails" | "too-many-invitations";

export type Invitation = { id: string; email: string; sentAt: Date };

export type InviteError =
  | "invalid-email"
  | "client-not-found"
  | "admin-email"
  | "other-client"
  | "not-first-owner"
  | "pending-exists"
  | QuotaRefusal;

// not-found: no live (pending, unexpired) Owner invitation of this Client
// has that id. too-many-emails: its address hit the hourly email cap.
// too-many-invitations: all invitation email together hit its hourly cap.
export type InvitationActionError = "not-found" | QuotaRefusal;

const INVITE_ERROR_STATUS: Record<InviteError, number> = {
  "invalid-email": UNPROCESSABLE,
  "client-not-found": NOT_FOUND,
  "admin-email": UNPROCESSABLE,
  "other-client": CONFLICT,
  "not-first-owner": CONFLICT,
  "pending-exists": CONFLICT,
  "too-many-emails": TOO_MANY_REQUESTS,
  "too-many-invitations": TOO_MANY_REQUESTS,
};

type InvitationsDeps = {
  db: Db;
  mailer: Mailer;
  // Lowercase.
  adminEmail: string;
  baseUrl: string;
  now: () => Date;
};

// What a saved row needs to be emailed.
type SavedInvitation = Invitation & { clientName: string };

export class FirstOwnerInvitations {
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

  async invite(
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
          .select({ name: organization.name })
          .from(clients)
          .innerJoin(organization, eq(organization.id, clients.id))
          .where(eq(clients.id, clientId))
          .for("update", { of: clients });
        if (!client) return "client-not-found";

        const reason =
          (await getInviteIneligibility(
            tx,
            { clientId, email },
            this.#adminEmail,
          )) ?? (await getSlotRefusal(tx, clientId, now));
        if (reason !== null) return reason;
        const quotaRefusal = await consumeInvitationQuota(tx, email, now);
        if (quotaRefusal !== null) return quotaRefusal;

        const [saved] = await tx
          .insert(invitation)
          .values({
            organizationId: clientId,
            email,
            role: "owner",
            status: "pending",
            expiresAt: new Date(now.getTime() + INVITATION_EXPIRES_IN_MS),
            createdAt: now,
            inviterId: await getAdminUserId(tx, this.#adminEmail),
          })
          .returning({
            id: invitation.id,
            email: invitation.email,
            sentAt: invitation.createdAt,
          });
        return { ...saved, clientName: client.name };
      },
    );
    if (typeof outcome === "string") return refuseInvite(outcome, clientId);

    await this.#email(outcome, clientId);
    return { value: toInvitation(outcome), error: null, status: CREATED };
  }

  // Same id, so the same link, with a fresh 7 days.
  async resend(
    clientId: string,
    invitationId: string,
  ): Promise<Result<Invitation, InvitationActionError>> {
    if (!isUuid(clientId, invitationId)) {
      return refuseAction("resend", "not-found");
    }

    const now = this.#now();
    const outcome = await this.#db.withSystem(
      async (tx): Promise<SavedInvitation | InvitationActionError> => {
        const [row] = await tx
          .select({
            id: invitation.id,
            email: invitation.email,
            sentAt: invitation.createdAt,
            clientName: organization.name,
          })
          .from(invitation)
          .innerJoin(
            organization,
            eq(organization.id, invitation.organizationId),
          )
          .where(isLive(clientId, invitationId, now))
          .for("update", { of: invitation });
        if (!row) return "not-found";
        const quotaRefusal = await consumeInvitationQuota(tx, row.email, now);
        if (quotaRefusal !== null) return quotaRefusal;

        await tx
          .update(invitation)
          .set({
            expiresAt: new Date(now.getTime() + INVITATION_EXPIRES_IN_MS),
          })
          .where(eq(invitation.id, row.id));
        return row;
      },
    );
    if (typeof outcome === "string") return refuseAction("resend", outcome);

    await this.#email(outcome, clientId);
    return { value: toInvitation(outcome), error: null, status: OK };
  }

  async revoke(
    clientId: string,
    invitationId: string,
  ): Promise<Result<null, InvitationActionError>> {
    if (!isUuid(clientId, invitationId)) {
      return refuseAction("revoke", "not-found");
    }

    const now = this.#now();
    const [row] = await this.#db.withSystem((tx) =>
      tx
        .update(invitation)
        .set({ status: "canceled" })
        .where(isLive(clientId, invitationId, now))
        .returning({ id: invitation.id }),
    );
    if (!row) return refuseAction("revoke", "not-found");

    return { value: null, error: null, status: OK };
  }

  // The row is saved either way: a failed send is logged and the Admin can
  // resend. The log line carries no address, link or provider message.
  async #email(saved: SavedInvitation, clientId: string): Promise<void> {
    const url = `${this.#baseUrl}/invitations/${saved.id}`;
    try {
      await this.#mailer.send(
        buildInvitationEmail(saved.email, saved.clientName, url),
      );
    } catch (error) {
      console.error(`auth: invitation email failed (${describeError(error)})`, {
        clientId,
      });
    }
  }
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

// A live first-Owner invitation of this Client.
function isLive(clientId: string, invitationId: string, now: Date) {
  return and(
    eq(invitation.id, invitationId),
    eq(invitation.organizationId, clientId),
    eq(invitation.role, "owner"),
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

function refuseAction(
  action: "resend" | "revoke",
  error: InvitationActionError,
): Result<never, InvitationActionError> {
  const status = error === "not-found" ? NOT_FOUND : TOO_MANY_REQUESTS;
  console.warn(`auth: refused to ${action} an invitation (${error})`);
  return { value: null, error, status };
}

function isUuid(...values: string[]): boolean {
  return values.every((value) => UUID_PATTERN.test(value));
}

// Counts one invitation email, per address (so a new invitation to the
// same person shares the cap) and against the global cap. Null when it may
// go out.
async function consumeInvitationQuota(
  tx: Tx,
  email: string,
  now: Date,
): Promise<QuotaRefusal | null> {
  const isAddressUnderCap = await consumeEmailQuota(
    tx,
    `invitation:${email}`,
    now,
    INVITATION_EMAIL_QUOTA,
  );
  if (!isAddressUnderCap) return "too-many-emails";

  const isUnderGlobalCap = await consumeEmailQuota(
    tx,
    ALL_INVITATIONS_KEY,
    now,
    ALL_INVITATIONS_QUOTA,
  );
  return isUnderGlobalCap ? null : "too-many-invitations";
}
