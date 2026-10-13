import { APIError } from "better-auth/api";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/db";
import { member, user } from "@/lib/db/schema";
import { normalizeInviteEmail } from "@/lib/invite-email";

// Who may be invited to a Client at all, whoever invites: the Admin's
// first-Owner invitations (inviteFirstOwner) and, from Phase 3, Owners'
// own (Better Auth's beforeCreateInvitation hook). Every Client User
// belongs to exactly one Client, and the Admin to none.

export type IneligibleReason = "admin-email" | "other-client";

type Invitee = {
  clientId: string;
  // Already normalised (normalizeInviteEmail).
  email: string;
};

// One message for every refusal on the hook path: a distinct one would let
// an Owner probe whether an address is a user of another Client. The
// Admin's direct path keeps the specific copy.
const REFUSAL_MESSAGE = "This email can't be invited.";

// Why `invitee` can't be invited to their Client, or null when they can. A
// member of any other Client counts, archived Clients included.
export async function getInviteIneligibility(
  tx: Tx,
  invitee: Invitee,
  adminEmail: string,
): Promise<IneligibleReason | null> {
  if (invitee.email === adminEmail.normalize("NFC").toLowerCase()) {
    return "admin-email";
  }

  const [otherMembership] = await tx
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(sql`lower(${user.email})`, invitee.email),
        ne(member.organizationId, invitee.clientId),
      ),
    )
    .limit(1);
  return otherMembership ? "other-client" : null;
}

type InvitationHookData = {
  invitation: { email: string; organizationId: string };
};

// The organization plugin's beforeCreateInvitation hook: the same rule,
// refused with Better Auth's APIError and one generic message.
export function createInvitationEligibilityHook(
  db: Db,
  adminEmail: string,
): (data: InvitationHookData) => Promise<void> {
  return async ({ invitation }) => {
    const email = normalizeInviteEmail(invitation.email);
    if (email === null) {
      console.warn("auth: refused an invitation (invalid email)");
      throw new APIError("FORBIDDEN", { message: REFUSAL_MESSAGE });
    }

    const reason = await db.withSystem((tx) =>
      getInviteIneligibility(
        tx,
        { clientId: invitation.organizationId, email },
        adminEmail,
      ),
    );
    if (reason !== null) {
      console.warn(`auth: refused an invitation (${reason})`, {
        clientId: invitation.organizationId,
      });
      throw new APIError("FORBIDDEN", { message: REFUSAL_MESSAGE });
    }
  };
}
