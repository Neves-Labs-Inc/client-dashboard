import type { ShouldRevalidateFunctionArgs } from "react-router";
import type {
  MappingEdit,
  RemoveError,
  SaveMappingError,
  SyncError,
} from "@/lib/board-sync/board-sync";
import {
  isSyncProblem,
  type SyncProblemInput,
} from "@/lib/board-sync/sync-problem";
import { withoutParam } from "@/lib/new-client";

// The Projects & boards tab's Sync now, Map columns, Unlink and Delete,
// posted to its route.

export const SYNC_NOW_INTENT = "sync-now";
export const SAVE_MAPPING_INTENT = "save-mapping";
export const UNLINK_INTENT = "unlink";
export const DELETE_INTENT = "delete";
export const PROJECT_ID_FIELD = "projectId";
// The Map columns drawer opens from `?map=<projectId>` on the tab.
export const MAP_PARAM = "map";

export type SyncNowOutcome =
  | { kind: "synced" }
  // An expected refusal, as the module's code. A failed sync carries the
  // error it recorded on the Project.
  | { kind: "refused"; error: SyncError; message: string | null }
  // Server or network failure.
  | { kind: "failed" };

export type SaveMappingOutcome =
  | { kind: "saved" }
  | { kind: "refused"; error: SaveMappingError }
  // Server or network failure.
  | { kind: "failed" };

export type RemoveIntent = typeof UNLINK_INTENT | typeof DELETE_INTENT;

export type RemoveOutcome =
  | { kind: "unlinked" }
  | { kind: "deleted" }
  // An expected refusal, as the module's code.
  | { kind: "refused"; error: RemoveError }
  // Server or network failure.
  | { kind: "failed" };

// What the loader gives the drawer for `?map=`: the Project it was loaded
// for (the URL may have moved on), and its mapping. Null mapping: no such
// Project on this Client. "failed": it couldn't load.
export type MapLoad = {
  projectId: string;
  mapping: MappingEdit | null | "failed";
};

export const MAP_COPY = {
  title: "Map columns",
  save: "Save mapping",
  saving: "Saving…",
  saved: "Mapping saved",
  loading: "Loading columns",
  loadFailed: "Couldn't load the columns. Close this and try again.",
  failed: "Couldn't save the mapping. Try again.",
  discard: "Discard your mapping changes?",
  unlinked: "This board was unlinked.",
  archived: "This Client is archived.",
  notFound: "This Project no longer exists.",
} as const;

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

export type SyncProblemReason = "error" | "stale";

export const SYNC_PROBLEM_COPY: Record<SyncProblemReason, string> = {
  error: "Sync problem: last sync failed",
  stale: "Sync problem: not synced in over 26 hours",
};

// Null when the board isn't a sync problem. A recorded error wins over
// staleness.
export function getSyncProblemReason(
  project: SyncProblemInput,
  now: Date,
): SyncProblemReason | null {
  if (!isSyncProblem(project, now)) return null;

  return project.lastSyncError === null ? "stale" : "error";
}

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

export function getMapHref(projectId: string): string {
  return `?${new URLSearchParams({ [MAP_PARAM]: projectId }).toString()}`;
}

export function getSaveFailure(outcome: SaveMappingOutcome): string {
  if (outcome.kind !== "refused") return MAP_COPY.failed;

  const copy: Record<SaveMappingError, string> = {
    unlinked: MAP_COPY.unlinked,
    archived: MAP_COPY.archived,
    "not-found": MAP_COPY.notFound,
  };
  return copy[outcome.error];
}

// True when a navigation only opens or closes the Map columns drawer.
// Layouts above the tab needn't reload for it.
export function isMapDrawerToggle({
  currentUrl,
  nextUrl,
}: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.search === nextUrl.search) return false;

  return (
    withoutParam(currentUrl, MAP_PARAM) === withoutParam(nextUrl, MAP_PARAM)
  );
}

// True when a navigation only drops `?map`: the tab's data is as it was.
export function isMapDrawerClose(
  args: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">,
): boolean {
  return (
    isMapDrawerToggle(args) &&
    args.currentUrl.searchParams.has(MAP_PARAM) &&
    !args.nextUrl.searchParams.has(MAP_PARAM)
  );
}
