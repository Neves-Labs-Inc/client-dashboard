import type { TeamMember } from "@/lib/auth/auth";
import type { RosterError } from "@/lib/auth/roster";
import { getDisplayName } from "@/lib/display-name";
import type { InvitationOutcome } from "@/lib/team-invitations";

// The roster actions of the Admin's Team tab and the client /team page. They
// post to the same route as the invitation actions, under the same intent
// field, naming the user in MEMBER_ID_FIELD.

export const MEMBER_ID_FIELD = "userId";

export const ROSTER_INTENTS = ["make-owner", "make-member", "remove"] as const;

export type RosterIntent = (typeof ROSTER_INTENTS)[number];

export type RosterOutcome =
  | { kind: "role-changed" }
  | { kind: "removed" }
  // An expected refusal, as the auth module's code.
  | { kind: "refused"; error: RosterError }
  // Server or network failure.
  | { kind: "failed" };

// What a Team route's action answers, whichever panel posted.
export type TeamOutcome = InvitationOutcome | RosterOutcome;

export const ROSTER_COPY = {
  makeOwner: "Make Owner",
  makeMember: "Make Member",
  remove: "Remove",
  keep: "Keep",
  saving: "Saving…",
  removing: "Removing…",
  roleUpdated: "Role updated",
  failed: "Couldn't update the team. Try again.",
  notOnTeam: "This person is no longer on the team.",
} as const;

export function isRosterIntent(intent: string): intent is RosterIntent {
  return (ROSTER_INTENTS as readonly string[]).includes(intent);
}

// The name, or the email when the name is empty.
export function getMemberLabel(member: TeamMember): string {
  return getDisplayName(member.name, member.email);
}

export function getRemovePrompt(member: TeamMember): string {
  return `Remove ${getMemberLabel(member)}? They lose access at once.`;
}

export function getRemovedToast(member: TeamMember): string {
  return `${getMemberLabel(member)} removed`;
}

export function getLastOwnerNotice(clientName: string): string {
  return `${clientName} must keep an Owner. Make someone else an Owner first.`;
}
