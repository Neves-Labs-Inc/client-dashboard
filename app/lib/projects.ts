import type { SyncError } from "@/lib/board-sync/board-sync";

// The Projects & boards tab's Sync now, posted to its route.

export const SYNC_NOW_INTENT = "sync-now";
export const PROJECT_ID_FIELD = "projectId";

export type SyncNowOutcome =
  | { kind: "synced" }
  // An expected refusal, as the module's code. A failed sync carries the
  // error it recorded on the Project.
  | { kind: "refused"; error: SyncError; message: string | null }
  // Server or network failure.
  | { kind: "failed" };

export const PROJECTS_COPY = {
  syncNow: "Sync now",
  syncing: "Syncing…",
  synced: "Synced",
  never: "Never",
  neverSynced: "Never synced",
  empty: "No boards linked yet.",
  linkFromHome: "Link one from Home",
  loadFailed: "Couldn't load Projects.",
} as const;

export function getSyncFailure(
  projectName: string,
  outcome: SyncNowOutcome,
): string {
  const message = outcome.kind === "refused" ? outcome.message : null;
  return message === null
    ? `Couldn't sync ${projectName}. Try again.`
    : `Couldn't sync ${projectName}: ${message}`;
}

export function getUnmappedLine(count: number): string {
  return `${count} unmapped ${count === 1 ? "column" : "columns"}`;
}
