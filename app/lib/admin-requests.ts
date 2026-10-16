import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import type { TriageError } from "@/lib/requests/requests";
import type { TriageStatus } from "@/lib/requests/request-rules";

// The Admin's Requests inbox, each Client's Requests tab, and the triage
// detail they open.

export const INBOX_PATH = "/admin/requests";
export const INBOX_ROUTE_PATTERN = "/admin/requests";
export const INBOX_REQUEST_ROUTE_PATTERN = "/admin/requests/:requestId";
export const CLIENT_REQUESTS_ROUTE_PATTERN =
  "/admin/clients/:clientId/requests";
export const CLIENT_REQUEST_ROUTE_PATTERN =
  "/admin/clients/:clientId/requests/:requestId";

// The inbox filter: New has no param, All is `?status=all`.
export const INBOX_FILTER_PARAM = "status";
export const INBOX_ALL_VALUE = "all";
export const INBOX_ALL_HREF = `${INBOX_PATH}?${INBOX_FILTER_PARAM}=${INBOX_ALL_VALUE}`;

export type InboxFilter = "new" | "all";

export const TRIAGE_STATUS_FIELD = "status";
export const TRIAGE_NOTE_FIELD = "responseNote";
export const TRIAGE_TASK_FIELD = "taskId";

// The statuses the Admin picks from, in the select's order.
export const TRIAGE_STATUSES = [
  "NEW",
  "ACCEPTED",
  "DECLINED",
  "DONE",
] as const satisfies readonly TriageStatus[];
// Only these keep a linked Task, so only these show the Task select.
const LINKING_STATUSES: readonly string[] = ["ACCEPTED", "DONE"];

export type TriageOutcome =
  | { kind: "saved" }
  // An expected refusal, as the module's code.
  | { kind: "refused"; error: TriageError }
  // Server or network failure.
  | { kind: "failed" };

export const REQUESTS_COPY = {
  inboxTitle: "Requests inbox",
  requests: "Requests",
  filterLabel: "Request filter",
  filterNew: "New",
  filterAll: "All",
  emptyNew: "No New Requests.",
  empty: "No Requests yet.",
  loadFailed: "Couldn't load Requests.",
  detailLoadFailed: "Couldn't load this Request.",
  notFound: "Request not found.",
  notFoundDetail: "Check the link, or pick the Request from the list.",
  request: "Request",
  triage: "Triage",
  description: "Description",
  responseNote: "Response note",
  noResponseNote: "No response note.",
  noProject: "No specific project",
  noTask: "No task",
  none: "None",
  notTracked: "(no longer tracked)",
  status: "Status",
  linkedTask: "Linked task",
  noteHelp: "The Client sees this note.",
  noTasksHelp: "This Client has no Tasks yet.",
  tasksFailedHelp: "Couldn't load Tasks. The current link is kept.",
  save: "Save",
  saving: "Saving…",
  saved: "Request saved",
  withdrawnLine: "Withdrawn by the submitter. Read-only.",
  withdrawn: "This Request was withdrawn and is read-only.",
  archived: "This Client is archived; its Requests are read-only.",
  taskNotFound: "That Task no longer exists. Pick another.",
  noteTooLong: "Keep the note under 5,000 characters.",
  saveFailed: "Couldn't save. Try again.",
} as const;

// The back link's marker: the list focuses this Request's title link once.
type FromRequestState = { fromRequestId: string };

export function getInboxFilter(searchParams: URLSearchParams): InboxFilter {
  return searchParams.get(INBOX_FILTER_PARAM) === INBOX_ALL_VALUE
    ? "all"
    : "new";
}

export function getInboxRequestPath(requestId: string): string {
  return `${INBOX_PATH}/${requestId}`;
}

export function getClientRequestsPath(clientId: string): string {
  return `/admin/clients/${clientId}/requests`;
}

export function getClientRequestPath(
  clientId: string,
  requestId: string,
): string {
  return `${getClientRequestsPath(clientId)}/${requestId}`;
}

export function isLinkingStatus(status: string): boolean {
  return LINKING_STATUSES.includes(status);
}

// The Task select's value once a save with `savedStatus` landed: only
// Accepted and Done keep a link, so any other status leaves "No task".
export function getTaskIdAfterSave(
  savedStatus: string,
  selectedTaskId: string,
): string {
  return isLinkingStatus(savedStatus) ? selectedTaskId : "";
}

export function getFromRequestId(state: unknown): string | null {
  const isFromRequest =
    typeof state === "object" &&
    state !== null &&
    "fromRequestId" in state &&
    typeof state.fromRequestId === "string";
  // Its shape is checked just above.
  return isFromRequest ? (state as FromRequestState).fromRequestId : null;
}

// The banner copy for a refused or failed save; null for `invalid`, which
// is the note's field error instead.
export function getTriageBanner(outcome: TriageOutcome): string | null {
  if (outcome.kind === "saved") return null;
  if (outcome.kind === "failed") return REQUESTS_COPY.saveFailed;

  const banners: Record<TriageError, string | null> = {
    invalid: null,
    withdrawn: REQUESTS_COPY.withdrawn,
    archived: REQUESTS_COPY.archived,
    "task-not-found": REQUESTS_COPY.taskNotFound,
    "not-found": REQUESTS_COPY.saveFailed,
  };
  return banners[outcome.error];
}

// A save refused because the Request just went read-only: the detail
// reloads, so the form goes away under the banner.
export function isReadOnlyRefusal({
  actionResult,
}: Pick<ShouldRevalidateFunctionArgs, "actionResult">): boolean {
  const isRefusal =
    typeof actionResult === "object" &&
    actionResult !== null &&
    "kind" in actionResult &&
    actionResult.kind === "refused" &&
    "error" in actionResult;
  if (!isRefusal) return false;

  const { error } = actionResult as { error: unknown };
  return error === "withdrawn" || error === "archived";
}

const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

export type TriageResponse = ReturnType<typeof data<TriageOutcome>>;

// Both triage routes' clientAction. A network failure (or a crash) becomes
// the banner instead of the route's error page; the guard's redirects still
// go through. Anything but a success keeps a 4xx/5xx status, so loaders
// revalidate only where shouldRevalidate asks (isReadOnlyRefusal).
export async function runTriageClientAction(
  serverAction: () => Promise<TriageOutcome>,
): Promise<TriageOutcome | TriageResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "saved") return outcome;

    const status = outcome.kind === "failed" ? SERVER_ERROR : UNPROCESSABLE;
    return data(outcome, { status });
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("admin: the triage request failed", error);
    return data<TriageOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}
