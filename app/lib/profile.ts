import type { RosterError } from "@/lib/auth/roster";

// The client /profile page's actions. They post to the page's own route,
// under the intent field.

export const PROFILE_PATH = "/profile";
export const PROFILE_INTENT_FIELD = "intent";
export const PROFILE_NAME_FIELD = "name";

export const PROFILE_INTENTS = ["rename", "leave"] as const;

export type ProfileIntent = (typeof PROFILE_INTENTS)[number];

export type ProfileOutcome =
  | { kind: "renamed" }
  // An expected refusal, as the auth module's code.
  | { kind: "refused"; error: "invalid-name" | RosterError }
  // Server or network failure.
  | { kind: "failed" };

// Where a Client User lands after leaving: the sign-in page shows the banner.
// The Client's name stays out of the URL (it would reach logs and history).
export const LEFT_PATH = "/sign-in?left=1";

export const PROFILE_COPY = {
  invalidName: "Enter a name (up to 100 characters).",
  saveFailed: "Couldn't save your name. Try again.",
  nameSaved: "Name saved",
  saving: "Saving…",
  leaving: "Leaving…",
  leave: "Leave",
  keep: "Keep",
  lastOwnerHelp: "You're the only Owner. Make someone else an Owner first.",
  leftBanner: "You left your Client.",
} as const;

export function getLeaveLabel(clientName: string): string {
  return `Leave ${clientName}`;
}

export function getLeavePrompt(
  clientName: string,
  canLeave: "yes" | "only-user",
): string {
  return canLeave === "only-user"
    ? `Leave ${clientName}? It will have no users until Neves Labs invites a new Owner.`
    : `Leave ${clientName}? You lose access at once.`;
}

export function getLeaveFailedNotice(clientName: string): string {
  return `Couldn't leave ${clientName}. Try again.`;
}

export function isProfileIntent(intent: string): intent is ProfileIntent {
  return (PROFILE_INTENTS as readonly string[]).includes(intent);
}
