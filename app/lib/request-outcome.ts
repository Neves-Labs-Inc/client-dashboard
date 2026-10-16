import { data, isRouteErrorResponse } from "react-router";
import type { FieldErrors, RequestDraft } from "@/lib/requests/request-rules";

// What the Requests actions answer, the field names they read, and the copy
// the client screens show for each outcome.

export const REQUEST_INTENT_FIELD = "intent";
export const REQUEST_FIELD = {
  kind: "kind",
  title: "title",
  description: "description",
  projectId: "projectId",
} as const;

export type RequestIntent = "edit" | "withdraw";

export type RequestOutcome =
  | { kind: "submitted"; requestId: string }
  | { kind: "updated"; requestId: string }
  | { kind: "withdrawn" }
  // The draft the server refused, as the shared rules' field copy.
  | { kind: "invalid"; fieldErrors: FieldErrors }
  // The Admin moved it out of New (or it was withdrawn) meanwhile.
  | { kind: "not-new" }
  // Server or network failure, or an archived Client.
  | { kind: "failed" };

export const REQUEST_COPY = {
  submitted: "Request submitted",
  updated: "Request updated",
  withdrawn: "Request withdrawn",
  notNew: "This Request is no longer New, so it can't be changed.",
  submitFailed: "Couldn't submit your request. Try again.",
  saveFailed: "Couldn't save your changes. Try again.",
  withdrawFailed: "Couldn't withdraw the request. Try again.",
  submitting: "Submitting…",
  saving: "Saving…",
  withdrawing: "Withdrawing…",
  notFound: "Request not found.",
} as const;

const CREATED = 201;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

const STATUS_BY_KIND: Record<RequestOutcome["kind"], number> = {
  submitted: CREATED,
  updated: 200,
  withdrawn: 200,
  invalid: UNPROCESSABLE,
  "not-new": CONFLICT,
  failed: SERVER_ERROR,
};

type OutcomeResponse = ReturnType<typeof data<RequestOutcome>>;

// The posted draft, unvalidated: the module's rules refuse a missing or
// non-text field instead of throwing.
export function readRequestDraft(form: FormData | null): RequestDraft {
  return {
    kind: form?.get(REQUEST_FIELD.kind) ?? null,
    title: form?.get(REQUEST_FIELD.title) ?? null,
    description: form?.get(REQUEST_FIELD.description) ?? null,
    projectId: form?.get(REQUEST_FIELD.projectId) ?? null,
  };
}

export function getOutcomeStatus(outcome: RequestOutcome): number {
  return STATUS_BY_KIND[outcome.kind];
}

// The Requests routes' clientAction. A network failure (or a crash) becomes
// the failed outcome instead of the route's error page; redirects and a 404
// still go through. Anything but a success keeps a 4xx/5xx status, so no
// loader revalidates on it: offline, a revalidation would throw the page to
// the root error boundary. The forms revalidate a `not-new` themselves.
export async function runRequestClientAction(
  serverAction: () => Promise<RequestOutcome>,
): Promise<RequestOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    const status = getOutcomeStatus(outcome);
    return status < 400 ? outcome : data(outcome, { status });
  } catch (error) {
    if (error instanceof Response || isRouteErrorResponse(error)) throw error;

    console.error("client: the Request request failed", error);
    return data<RequestOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}
