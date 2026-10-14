import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { getInviteIneligibility } from "@/lib/auth/invite-eligibility";
import type { Tx } from "@/lib/db/db";
import {
  clients,
  invitation,
  member,
  organization,
  user,
} from "@/lib/db/schema";

// Accepting an Invitation: the member row and the accepted status, written
// here in the organization plugin's exact shape rather than through its
// acceptInvitation. The plugin's endpoint runs on its own pool and clock, so
// it can't hold the Client's row lock or re-check eligibility inside the
// same transaction, and two racing joins could both pass its checks.

export type JoinError =
  // No live Invitation with that id (or none at all for the email).
  | "not-found"
  // That Invitation is live, but for another email.
  | "email-mismatch"
  // The email now belongs to a user of another Client.
  | "ineligible"
  | "archived";

export type Joined = { clientId: string; clientName: string };

// isNew: this call wrote the member row; false when the joiner already was
// one (a re-opened link, or a racing join that got there first).
export type JoinOutcome = Joined & { isNew: boolean };

type Joiner = {
  userId: string;
  // Lowercased (NFC), as Invitations store it.
  email: string;
};

type InvitationRow = {
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
};

const INVITATION_COLUMNS = {
  id: invitation.id,
  organizationId: invitation.organizationId,
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
};

// Joins `joiner` to the Client of Invitation `invitationId`, or of their
// newest live Invitation when it's null. Run inside one transaction: the
// user row's lock makes one person's joins run one at a time (so two Clients
// can't both take them), and the Client row's lock makes the eligibility
// check and the write one step. Re-opening an Invitation the joiner already
// accepted returns its Client again.
export async function joinInvitation(
  tx: Tx,
  joiner: Joiner,
  invitationId: string | null,
  now: Date,
  adminEmail: string,
): Promise<JoinOutcome | JoinError> {
  const [joinerRow] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, joiner.userId))
    .for("no key update");
  if (!joinerRow) return "not-found";

  // With no id, a member already (a join in another tab won the race, to
  // this Client or another): their Client is the answer.
  const membership =
    invitationId === null ? await findMembership(tx, joiner.userId) : null;
  if (membership !== null) return membership;

  const target =
    invitationId === null
      ? await findNewestLive(tx, joiner.email, now)
      : await findById(tx, invitationId);
  if (!target) return "not-found";

  // Client first, then the Invitation: the order every Client-wide change
  // (invite, archive) takes its locks in.
  const [client] = await tx
    .select({ name: organization.name, archivedAt: clients.archivedAt })
    .from(clients)
    .innerJoin(organization, eq(organization.id, clients.id))
    .where(eq(clients.id, target.organizationId))
    .for("update", { of: clients });
  const current = await findById(tx, target.id, { isLocked: true });
  if (!client || !current) return "not-found";

  const joined = { clientId: current.organizationId, clientName: client.name };
  const isForJoiner = normalizeEmail(current.email) === joiner.email;
  const isMember = await isMemberOf(tx, joiner.userId, joined.clientId);
  if (current.status === "accepted" && isForJoiner && isMember) {
    return client.archivedAt === null
      ? { ...joined, isNew: false }
      : "archived";
  }
  if (!isLive(current, now)) return "not-found";
  if (!isForJoiner) return "email-mismatch";

  const ineligibility = await getInviteIneligibility(
    tx,
    { clientId: joined.clientId, email: joiner.email },
    adminEmail,
  );
  if (ineligibility !== null) return "ineligible";
  if (client.archivedAt !== null) return "archived";

  // A member already (a second Invitation to the same team): the
  // Invitation is used up, and no second row is written.
  if (!isMember) {
    await tx.insert(member).values({
      organizationId: joined.clientId,
      userId: joiner.userId,
      role: current.role === "owner" ? "owner" : "member",
      createdAt: now,
    });
  }
  await tx
    .update(invitation)
    .set({ status: "accepted" })
    .where(eq(invitation.id, current.id));
  return { ...joined, isNew: !isMember };
}

async function findNewestLive(
  tx: Tx,
  email: string,
  now: Date,
): Promise<InvitationRow | null> {
  const [row] = await tx
    .select(INVITATION_COLUMNS)
    .from(invitation)
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .orderBy(desc(invitation.createdAt), desc(invitation.id))
    .limit(1);
  return row ?? null;
}

async function findById(
  tx: Tx,
  invitationId: string,
  { isLocked = false }: { isLocked?: boolean } = {},
): Promise<InvitationRow | null> {
  const query = tx
    .select(INVITATION_COLUMNS)
    .from(invitation)
    .where(eq(invitation.id, invitationId));
  const [row] = isLocked ? await query.for("update") : await query;
  return row ?? null;
}

// The joiner's Client, or archived when it is; null when they have none.
async function findMembership(
  tx: Tx,
  userId: string,
): Promise<JoinOutcome | "archived" | null> {
  const [row] = await tx
    .select({
      clientId: clients.id,
      clientName: organization.name,
      archivedAt: clients.archivedAt,
    })
    .from(member)
    .innerJoin(clients, eq(clients.id, member.organizationId))
    .innerJoin(organization, eq(organization.id, clients.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  if (!row) return null;

  const { archivedAt, ...joined } = row;
  return archivedAt === null ? { ...joined, isNew: false } : "archived";
}

async function isMemberOf(
  tx: Tx,
  userId: string,
  clientId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, clientId)))
    .limit(1);
  return row !== undefined;
}

function isLive(row: InvitationRow, now: Date): boolean {
  return row.status === "pending" && row.expiresAt > now;
}

function normalizeEmail(email: string): string {
  return email.normalize("NFC").toLowerCase();
}
