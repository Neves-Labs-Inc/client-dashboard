import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  type FieldErrors,
  type InvoiceDraft,
  LINE_ITEMS_MAX,
} from "@/lib/invoices/invoice-rules";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { formatMoney } from "@/lib/money";
import { withoutParam } from "@/lib/new-client";

// Each Client's Invoices tab, the New invoice drawer on it, and the detail
// it opens.

export const CLIENT_INVOICES_ROUTE_PATTERN =
  "/admin/clients/:clientId/invoices";
export const CLIENT_INVOICE_ROUTE_PATTERN =
  "/admin/clients/:clientId/invoices/:invoiceId";

// The global list of every Client's Invoices, and the detail it opens.
export const INVOICES_PATH = "/admin/invoices";
export const INVOICES_ROUTE_PATTERN = INVOICES_PATH;
export const INVOICE_ROUTE_PATTERN = "/admin/invoices/:invoiceId";

type ClientOption = { id: string; name: string };

// The global list's Client filter: active Clients, then archived, each A–Z.
export type InvoiceClientOptions = {
  active: ClientOption[];
  archived: ClientOption[];
};

// The drawer opens from `?new=invoice` on the tab, as the create-Client
// drawer does from `?new=client`.
export const NEW_INVOICE_PARAM = "new";
export const NEW_INVOICE_VALUE = "invoice";

// The form's field names. Each Line Item posts one `description` and one
// `amount`, in order.
export const INVOICE_FIELD = {
  // The global drawer's only: the tab's Client is in its URL.
  clientId: "clientId",
  issueDate: "issueDate",
  dueDate: "dueDate",
  projectId: "projectId",
  memo: "memo",
  description: "description",
  amount: "amount",
} as const;

export type CreateInvoiceOutcome =
  | { kind: "created"; invoiceId: string; number: string }
  // The draft the server refused, as the module's field copy.
  | { kind: "invalid"; fieldErrors: FieldErrors }
  | { kind: "refused"; error: "archived" | "not-found" }
  // Server or network failure.
  | { kind: "failed" };

export type CreateInvoiceResponse = ReturnType<
  typeof data<CreateInvoiceOutcome>
>;

export const INVOICES_COPY = {
  invoices: "Invoices",
  newInvoice: "New invoice",
  drawerTitle: "New invoice",
  empty: "No Invoices yet.",
  loadFailed: "Couldn't load Invoices.",
  detailLoadFailed: "Couldn't load this Invoice.",
  notFound: "Invoice not found.",
  notFoundDetail: "Check the link, or pick the Invoice from the list.",
  details: "Details",
  lineItems: "Line items",
  memo: "Memo",
  issueDate: "Issue date",
  dueDate: "Due date",
  project: "Project",
  noProject: "No specific project",
  projectsFailed: "Couldn't load Projects. You can issue without one.",
  description: "Description",
  amount: "Amount",
  total: "Total",
  addLine: "Add line",
  linesMax: "50 lines is the most an Invoice can hold.",
  help: "The number is assigned when you issue it.",
  issue: "Issue invoice",
  issuing: "Issuing…",
  createFailed: "Couldn't issue this invoice. Try again.",
  archived: "This Client is archived; its Invoices are read-only.",
  clientNotFound: "This Client no longer exists.",
  discard: "Discard this invoice?",
  client: "Client",
  chooseClient: "Choose a client",
  clientRequired: "Choose a client.",
  noActiveClients: "No active Clients to invoice.",
  clientsFailed: "Couldn't load Clients.",
} as const;

// The back link's marker: the tab focuses this Invoice's number link once.
type FromInvoiceState = { fromInvoiceId: string };

// The global list's marker on a row link: the detail's back link restores
// this search ("?status=open", or "").
type FromListState = { fromListSearch: string };

const CREATED = 201;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

export function getClientInvoicesPath(clientId: string): string {
  return `/admin/clients/${clientId}/invoices`;
}

export function getClientInvoicePath(
  clientId: string,
  invoiceId: string,
): string {
  return `${getClientInvoicesPath(clientId)}/${invoiceId}`;
}

export function getInvoicePath(invoiceId: string): string {
  return `${INVOICES_PATH}/${invoiceId}`;
}

// The global detail's way back: the list with the search it came from, or
// plain on a direct visit. Anything but a search ("?…") is ignored, so the
// link never leaves the list.
export function getInvoicesBackPath(state: unknown): string {
  const hasListSearch =
    typeof state === "object" &&
    state !== null &&
    "fromListSearch" in state &&
    typeof state.fromListSearch === "string" &&
    state.fromListSearch.startsWith("?");
  // Its shape is checked just above.
  const search = hasListSearch ? (state as FromListState).fromListSearch : "";
  return `${INVOICES_PATH}${search}`;
}

export function getIssuedToast(number: string): string {
  return `Invoice ${number} issued`;
}

// Open and Overdue: what the Client still owes.
export function getOpenBalanceCents(rows: readonly InvoiceRow[]): number {
  return rows
    .filter((row) => row.status === "OPEN" || row.status === "OVERDUE")
    .reduce((sum, row) => sum + row.totalCents, 0);
}

// The global list's panel meta: "1 invoice · open $0.00".
export function getListMeta(rows: readonly InvoiceRow[]): string {
  const count = rows.length === 1 ? "1 invoice" : `${rows.length} invoices`;
  return `${count} · open ${formatMoney(getOpenBalanceCents(rows))}`;
}

export function toFromInvoiceState(invoiceId: string): FromInvoiceState {
  return { fromInvoiceId: invoiceId };
}

export function toFromListState(search: string): FromListState {
  return { fromListSearch: search };
}

export function getFromInvoiceId(state: unknown): string | null {
  const isFromInvoice =
    typeof state === "object" &&
    state !== null &&
    "fromInvoiceId" in state &&
    typeof state.fromInvoiceId === "string";
  // Its shape is checked just above.
  return isFromInvoice ? (state as FromInvoiceState).fromInvoiceId : null;
}

// True when a navigation only opens or closes the drawer: same path, and
// the search differs in NEW_INVOICE_PARAM alone. Loaders needn't run for it.
export function isInvoiceDrawerToggle({
  currentUrl,
  nextUrl,
}: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.search === nextUrl.search) return false;

  return (
    withoutParam(currentUrl, NEW_INVOICE_PARAM) ===
    withoutParam(nextUrl, NEW_INVOICE_PARAM)
  );
}

function readText(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

function readTexts(form: FormData | null, name: string): string[] {
  return (form?.getAll(name) ?? []).map((value) =>
    typeof value === "string" ? value : "",
  );
}

// The posted draft, unvalidated: the module's rules refuse it. A forged
// post's lines are read up to one past the cap, enough for the cap's error
// without walking an unbounded list.
export function readInvoiceDraft(form: FormData | null): InvoiceDraft {
  const descriptions = readTexts(form, INVOICE_FIELD.description);
  const amounts = readTexts(form, INVOICE_FIELD.amount);
  const lineCount = Math.min(
    Math.max(descriptions.length, amounts.length),
    LINE_ITEMS_MAX + 1,
  );
  return {
    issueDate: readText(form, INVOICE_FIELD.issueDate),
    dueDate: readText(form, INVOICE_FIELD.dueDate),
    projectId: readText(form, INVOICE_FIELD.projectId),
    memo: readText(form, INVOICE_FIELD.memo),
    lineItems: Array.from({ length: lineCount }, (_, index) => ({
      description: descriptions[index] ?? "",
      amount: amounts[index] ?? "",
    })),
  };
}

const STATUS_BY_KIND: Record<CreateInvoiceOutcome["kind"], number> = {
  created: CREATED,
  invalid: UNPROCESSABLE,
  refused: CONFLICT,
  failed: SERVER_ERROR,
};

export function getCreateStatus(outcome: CreateInvoiceOutcome): number {
  if (outcome.kind === "refused" && outcome.error === "not-found") {
    return NOT_FOUND;
  }

  return STATUS_BY_KIND[outcome.kind];
}

// The drawer's banner for a refused or failed create; null for a success
// or field errors.
export function getCreateBanner(outcome: CreateInvoiceOutcome): string | null {
  if (outcome.kind === "created" || outcome.kind === "invalid") return null;
  if (outcome.kind === "failed") return INVOICES_COPY.createFailed;

  return outcome.error === "archived"
    ? INVOICES_COPY.archived
    : INVOICES_COPY.clientNotFound;
}

// The tab's clientAction. A network failure (or a crash) becomes the
// banner instead of the route's error page; the guard's redirects still go
// through. Anything but a success keeps a 4xx/5xx status, so no loader
// revalidates on it.
export async function runInvoiceClientAction(
  serverAction: () => Promise<CreateInvoiceOutcome>,
): Promise<CreateInvoiceOutcome | CreateInvoiceResponse> {
  try {
    const outcome = await serverAction();
    const status = getCreateStatus(outcome);
    return status < 400 ? outcome : data(outcome, { status });
  } catch (error) {
    if (error instanceof Response || isRouteErrorResponse(error)) throw error;

    console.error("admin: the New invoice request failed", error);
    return data<CreateInvoiceOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}
