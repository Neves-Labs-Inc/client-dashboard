import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getInviteIneligibility } from "@/lib/auth/invite-eligibility";
import type { Tx } from "@/lib/db/db";
import {
  clients,
  invitation,
  member,
  organization,
  user,
} from "@/lib/db/schema";

// Where an email stands with the portal, read fresh every time: the one
// answer behind who may get an account, a session, a magic link, and which
// Access a session has.

export type Membership = {
  clientId: string;
  clientName: string;
  role: "owner" | "member";
  isArchived: boolean;
};

export type Standing =
  | { kind: "admin" }
  // A Client User (a member row), of an active or an archived Client.
  | { kind: "member"; membership: Membership }
  // No member row, but a live pending Invitation they may still accept.
  | { kind: "invitee" }
  | { kind: "none" };

// `email` and `adminEmail` are compared lowercased (NFC), as stored.
export async function getStanding(
  tx: Tx,
  email: string,
  now: Date,
  adminEmail: string,
): Promise<Standing> {
  const normalized = normalizeEmail(email);
  if (normalized === normalizeEmail(adminEmail)) return { kind: "admin" };

  const membership = await findMembership(tx, normalized);
  if (membership) return { kind: "member", membership };

  const isInvitee = await hasLiveEligibleInvitation(
    tx,
    normalized,
    now,
    adminEmail,
  );
  return isInvitee ? { kind: "invitee" } : { kind: "none" };
}

function normalizeEmail(email: string): string {
  return email.normalize("NFC").toLowerCase();
}

// A Client User belongs to one Client; the oldest row wins should a second
// ever appear.
async function findMembership(
  tx: Tx,
  email: string,
): Promise<Membership | null> {
  const [row] = await tx
    .select({
      clientId: clients.id,
      clientName: organization.name,
      role: member.role,
      archivedAt: clients.archivedAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(clients, eq(clients.id, member.organizationId))
    .innerJoin(organization, eq(organization.id, clients.id))
    .where(eq(sql`lower(${user.email})`, email))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  if (!row) return null;

  return {
    clientId: row.clientId,
    clientName: row.clientName,
    role: row.role === "owner" ? "owner" : "member",
    isArchived: row.archivedAt !== null,
  };
}

// Live: pending and unexpired. Eligible: the email may still join that
// Client (not the Admin's, not another Client's user).
async function hasLiveEligibleInvitation(
  tx: Tx,
  email: string,
  now: Date,
  adminEmail: string,
): Promise<boolean> {
  const invitations = await tx
    .select({ clientId: invitation.organizationId })
    .from(invitation)
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    );

  let isEligible = false;
  for (const { clientId } of invitations) {
    const reason = await getInviteIneligibility(
      tx,
      { clientId, email },
      adminEmail,
    );
    if (reason === null) {
      isEligible = true;
      break;
    }
  }
  return isEligible;
}
