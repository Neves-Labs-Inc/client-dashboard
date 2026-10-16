import type { SyncWarning } from "@/lib/db/schema";
import { formatDate, parseDateOnly } from "@/lib/format-date";
import { getProjectsPath } from "@/lib/link-board";

// The Admin's board detail, in place of the Projects & boards tab.

export const BOARD_ROUTE_PATTERN =
  "/admin/clients/:clientId/projects/:projectId";

export const BOARD_DETAIL_COPY = {
  back: "Projects & boards",
  github: "Open on GitHub",
  never: "Never",
  present: "Present",
  missing: "Missing",
  notChecked: "Not checked yet",
  noMilestones: "No Milestones.",
  noTasks: "No client-visible Tasks.",
  noStatus: "No Status",
  otherWork: "Other work",
  notFound: "Project not found.",
  notFoundDetail: "It was deleted, or it belongs to another Client.",
  loadFailed: "Couldn't load this board.",
} as const;

// The back link's marker: the tab focuses this Project's name link once.
type FromProjectState = { fromProjectId: string };

export function getBoardPath(clientId: string, projectId: string): string {
  return `${getProjectsPath(clientId)}/${projectId}`;
}

export function getFromProjectId(state: unknown): string | null {
  const isFromProject =
    typeof state === "object" &&
    state !== null &&
    "fromProjectId" in state &&
    typeof state.fromProjectId === "string";
  // Its shape is checked just above.
  return isFromProject ? (state as FromProjectState).fromProjectId : null;
}

export function getWarningLine(warning: SyncWarning): string {
  if (warning.kind === "missing-field") {
    return `Missing field: ${warning.field}`;
  }
  if (warning.kind === "milestone-date-mismatch") {
    const dates = warning.dueDates
      .map((date) => formatDate(parseDateOnly(date)))
      .join(", ");
    return `Milestone '${warning.title}' has different due dates across repos: ${dates}`;
  }

  const noun = warning.count === 1 ? "item" : "items";
  return `${warning.count} ${noun} couldn't be read`;
}

// The board's URL comes from GitHub; anything but https (javascript:, a
// malformed value) is never rendered as a link.
export function isHttpsUrl(url: string): boolean {
  return URL.canParse(url) && new URL(url).protocol === "https:";
}
