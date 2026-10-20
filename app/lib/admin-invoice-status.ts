import { data, isRouteErrorResponse } from "react-router";
import type { DisplayStatus, FieldErrors } from "@/lib/invoices/invoice-rules";
import type {
  MarkPaidError,
  RevertError,
  VoidError,
} from "@/lib/invoices/invoices";

// The Admin Invoice detail's status changes: Mark paid, Revert to Open and
// Void, each behind an inline confirm. They post to the detail route.

export const STATUS_INTENT_FIELD = "intent";
export const PAID_DATE_FIELD = "paidDate";

export const STATUS_INTENTS = ["paid", "revert", "void"] as const;
export type StatusIntent = (typeof STATUS_INTENTS)[number];

export type StatusRefusal = Exclude<
  MarkPaidError | RevertError | VoidError,
  "invalid"
>;

export type StatusChangeOutcome =
  | { kind: "changed"; intent: StatusIntent }
  // The paid date the module refused, as its field copy.
  | { kind: "invalid"; fieldErrors: FieldErrors }
  // A stale detail: the Invoice or its Client changed meanwhile. A
  // `not-found` never reaches the page: the route answers it with a 404.
  | { kind: "refused"; intent: StatusIntent; error: StatusRefusal }
  // Server or network failure, or a forged intent.
  | { kind: "failed" };

export type StatusChangeResponse = ReturnType<typeof data<StatusChangeOutcome>>;

export const STATUS_COPY = {
  paidOn: "Paid on",
  cancel: "Cancel",
  archived: "This Client is archived; its Invoices are read-only.",
} as const;

// Each intent's trigger, confirm and outcome copy.
export const STATUS_INTENT_COPY = {
  paid: {
    trigger: "Mark paid",
    confirm: "Mark paid",
    pending: "Marking paid…",
    detail: null,
    changed: "Invoice marked paid",
    failed: "Couldn't mark the invoice paid. Try again.",
  },
  revert: {
    trigger: "Revert to Open",
    confirm: "Revert",
    pending: "Reverting…",
    detail: "Its paid date is cleared.",
    changed: "Invoice reverted to Open",
    failed: "Couldn't revert the invoice. Try again.",
  },
  void: {
    trigger: "Void invoice",
    confirm: "Void",
    pending: "Voiding…",
    detail: "This can't be undone. The number stays used.",
    changed: "Invoice voided",
    failed: "Couldn't void the invoice. Try again.",
  },
} as const satisfies Record<StatusIntent, unknown>;

const BAD_REQUEST = 400;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

const STATUS_BY_KIND: Record<StatusChangeOutcome["kind"], number> = {
  changed: 200,
  invalid: UNPROCESSABLE,
  refused: CONFLICT,
  failed: SERVER_ERROR,
};

export function isStatusIntent(value: unknown): value is StatusIntent {
  return STATUS_INTENTS.some((intent) => intent === value);
}

// The intent and paid date as posted; null for a missing or forged intent.
export function readStatusChange(
  form: FormData | null,
): { intent: StatusIntent; paidDate: string } | null {
  const intent = form?.get(STATUS_INTENT_FIELD);
  if (!isStatusIntent(intent)) return null;

  const paidDate = form?.get(PAID_DATE_FIELD);
  return { intent, paidDate: typeof paidDate === "string" ? paidDate : "" };
}

export function getStatusChangeStatus(outcome: StatusChangeOutcome): number {
  return STATUS_BY_KIND[outcome.kind];
}

export const UNKNOWN_INTENT_STATUS = BAD_REQUEST;

// The confirms the Admin may open: none on an archived Client's Invoice.
export function getStatusIntents(
  status: DisplayStatus,
  isArchived: boolean,
): StatusIntent[] {
  if (isArchived) return [];
  if (status === "OPEN" || status === "OVERDUE") return ["paid", "void"];
  if (status === "PAID") return ["revert"];

  return [];
}

// The banner for a stale detail. `not-open` reads differently for a Void,
// which an Open Invoice alone allows.
export function getRefusalCopy(
  intent: StatusIntent,
  error: StatusRefusal,
): string {
  if (error === "archived") return STATUS_COPY.archived;
  if (error === "not-paid") return "This Invoice is no longer Paid.";
  if (error === "not-found") return "Invoice not found.";

  return intent === "void"
    ? "Only an Open Invoice can be voided."
    : "This Invoice is no longer Open.";
}

// The detail's clientAction. A network failure (or a crash) becomes the
// confirm's alert instead of the route's error page; the guard's redirects
// and a 404 still go through. Anything but a change keeps its 4xx/5xx
// status, so no loader revalidates on it: the confirm revalidates a stale
// refusal itself.
export async function runStatusClientAction(
  serverAction: () => Promise<StatusChangeOutcome>,
): Promise<StatusChangeOutcome | StatusChangeResponse> {
  try {
    const outcome = await serverAction();
    const status = getStatusChangeStatus(outcome);
    return status < BAD_REQUEST ? outcome : data(outcome, { status });
  } catch (error) {
    if (error instanceof Response || isRouteErrorResponse(error)) throw error;

    console.error("admin: the Invoice status request failed", error);
    return data<StatusChangeOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}
