import type { ArchiveError } from "@/lib/auth/auth";

// The Admin's archive and unarchive of a Client, posted to its Team route
// under the same intent field as the invitation and roster actions.

export const ARCHIVE_INTENTS = ["archive", "unarchive"] as const;

export type ArchiveIntent = (typeof ARCHIVE_INTENTS)[number];

export type ArchiveOutcome =
  | { kind: "archived" }
  | { kind: "unarchived" }
  // An expected refusal, as the auth module's code.
  | { kind: "refused"; error: ArchiveError }
  // Server or network failure.
  | { kind: "failed" };

export const ARCHIVE_COPY = {
  archiveClient: "Archive client",
  archive: "Archive",
  archiving: "Archiving…",
  keep: "Keep",
  unarchive: "Unarchive",
  unarchiving: "Unarchiving…",
  archived: "Client archived",
  unarchived: "Client unarchived",
  badge: "Archived",
} as const;

export function isArchiveIntent(intent: string): intent is ArchiveIntent {
  return (ARCHIVE_INTENTS as readonly string[]).includes(intent);
}

// The first sentence is the question; the rest says what happens.
export function getArchivePrompt(clientName: string): {
  question: string;
  detail: string;
} {
  return {
    question: `Archive ${clientName}?`,
    detail:
      "Its users are signed out and can't sign in until you unarchive it. Pending invitations are canceled. Nothing is deleted.",
  };
}

export function getArchiveFailure(
  intent: ArchiveIntent,
  clientName: string,
): string {
  return `Couldn't ${intent} ${clientName}. Try again.`;
}
