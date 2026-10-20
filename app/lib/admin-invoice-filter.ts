import { isIsoDate, NUMBER_QUERY_MAX } from "@/lib/invoices/invoice-rules";
import type {
  AdminInvoiceFilter,
  InvoiceListStatus,
} from "@/lib/invoices/invoices";

// The Admin's global Invoice list filter, read from and written back to the
// URL. Pure, so the page's controls and its loader share it.

export const INVOICE_FILTER_PARAM = {
  status: "status",
  client: "client",
  issued: "issued",
  from: "from",
  to: "to",
  q: "q",
} as const;

export const INVOICE_FILTER_COPY = {
  rangeError: "From must be on or before To.",
  noMatches: "No Invoices match these filters.",
  clearFilters: "Clear filters",
  allClients: "All clients",
  anyTime: "Any time",
  customRange: "Custom range",
  yearsFailed: "Couldn't load years.",
  chooseClient: "Choose a client.",
  statusLabel: "Invoice status",
  filterAll: "All",
  filterOpen: "Open",
  filterOverdue: "Overdue",
  filterPaid: "Paid",
  filterVoid: "Void",
  filtersLabel: "Filter Invoices",
  client: "Client",
  archivedGroup: "Archived",
  issued: "Issued",
  from: "From",
  to: "To",
  rangeLabel: "Issued range",
  number: "Number",
  numberPlaceholder: "NL-0042",
  apply: "Apply",
} as const;

export type StatusChoice = "all" | "open" | "overdue" | "paid" | "void";
// "any", a year such as "2026", or "custom".
export type IssuedChoice = "any" | "custom" | `${number}`;

// What the controls show: the filter actually applied, except that a From
// after To keeps both dates as typed.
export type InvoiceListForm = {
  status: StatusChoice;
  clientId: string | null;
  issued: IssuedChoice;
  // "YYYY-MM-DD" or "", only with issued "custom".
  from: string;
  to: string;
  q: string;
};

export type InvoiceListFilter = {
  applied: AdminInvoiceFilter;
  form: InvoiceListForm;
  rangeError: string | null;
};

// What the caller knows: the Clients the filter may name, and the years
// with Invoices.
export type InvoiceFilterOptions = {
  clientIds: readonly string[];
  years: readonly number[];
};

const ANY_TIME = "any";
const CUSTOM_RANGE = "custom";
const ALL_STATUSES = "all";

const STATUS_BY_CHOICE: Record<
  Exclude<StatusChoice, "all">,
  InvoiceListStatus
> = {
  open: "OPEN",
  overdue: "OVERDUE",
  paid: "PAID",
  void: "VOID",
};

const YEAR_PATTERN = /^\d{4}$/;
// Shape check only, as the modules do.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isStatusChoice(value: string): value is Exclude<StatusChoice, "all"> {
  return Object.hasOwn(STATUS_BY_CHOICE, value);
}

function readStatus(searchParams: URLSearchParams): StatusChoice {
  const value = searchParams.get(INVOICE_FILTER_PARAM.status) ?? "";
  return isStatusChoice(value) ? value : ALL_STATUSES;
}

function readClientId(
  searchParams: URLSearchParams,
  clientIds: readonly string[],
): string | null {
  const value = searchParams.get(INVOICE_FILTER_PARAM.client) ?? "";
  const isKnown = UUID_PATTERN.test(value) && clientIds.includes(value);
  return isKnown ? value : null;
}

function readIssued(
  searchParams: URLSearchParams,
  years: readonly number[],
): IssuedChoice {
  const value = searchParams.get(INVOICE_FILTER_PARAM.issued) ?? "";
  if (value === CUSTOM_RANGE) return CUSTOM_RANGE;

  const isKnownYear = YEAR_PATTERN.test(value) && years.includes(Number(value));
  // Four digits, checked just above.
  return isKnownYear ? (value as `${number}`) : ANY_TIME;
}

// A real "YYYY-MM-DD" date, or "".
function readDate(searchParams: URLSearchParams, name: string): string {
  const value = searchParams.get(name) ?? "";
  return isIsoDate(value) ? value : "";
}

// Trimmed and cut to NUMBER_QUERY_MAX characters (code points, as the
// module cuts it).
function readQuery(searchParams: URLSearchParams): string {
  const value = (searchParams.get(INVOICE_FILTER_PARAM.q) ?? "").trim();
  return Array.from(value).slice(0, NUMBER_QUERY_MAX).join("").trimEnd();
}

// The issue date bounds a form applies: a year's Jan 1–Dec 31, a custom
// range's typed bounds, or none.
function getIssuedRange(
  form: InvoiceListForm,
): Pick<AdminInvoiceFilter, "issuedFrom" | "issuedTo"> {
  if (form.issued === ANY_TIME) return {};
  if (form.issued !== CUSTOM_RANGE) {
    return {
      issuedFrom: `${form.issued}-01-01`,
      issuedTo: `${form.issued}-12-31`,
    };
  }

  return {
    ...(form.from === "" ? {} : { issuedFrom: form.from }),
    ...(form.to === "" ? {} : { issuedTo: form.to }),
  };
}

// Unknown or malformed params are unset; a From after To drops both bounds
// and sets `rangeError`. The drawer's `new` param is never read.
export function parseInvoiceListFilter(
  searchParams: URLSearchParams,
  options: InvoiceFilterOptions,
): InvoiceListFilter {
  const issued = readIssued(searchParams, options.years);
  const isCustom = issued === CUSTOM_RANGE;
  const form: InvoiceListForm = {
    status: readStatus(searchParams),
    clientId: readClientId(searchParams, options.clientIds),
    issued,
    from: isCustom ? readDate(searchParams, INVOICE_FILTER_PARAM.from) : "",
    to: isCustom ? readDate(searchParams, INVOICE_FILTER_PARAM.to) : "",
    q: readQuery(searchParams),
  };
  // ISO dates compare as text.
  const isRangeReversed =
    form.from !== "" && form.to !== "" && form.from > form.to;
  const applied: AdminInvoiceFilter = {
    ...(form.status === ALL_STATUSES
      ? {}
      : { status: STATUS_BY_CHOICE[form.status] }),
    ...(form.clientId === null ? {} : { clientId: form.clientId }),
    ...(isRangeReversed ? {} : getIssuedRange(form)),
    ...(form.q === "" ? {} : { numberQuery: form.q }),
  };
  return {
    applied,
    form,
    rangeError: isRangeReversed ? INVOICE_FILTER_COPY.rangeError : null,
  };
}

// The search string for a form, "?status=open&q=42", or "" with no filter
// set. Defaults and empty values are left out; from and to only go with a
// custom range.
export function toInvoiceListSearch(form: InvoiceListForm): string {
  const isCustom = form.issued === CUSTOM_RANGE;
  const entries: [string, string][] = [
    [
      INVOICE_FILTER_PARAM.status,
      form.status === ALL_STATUSES ? "" : form.status,
    ],
    [INVOICE_FILTER_PARAM.client, form.clientId ?? ""],
    [INVOICE_FILTER_PARAM.issued, form.issued === ANY_TIME ? "" : form.issued],
    [INVOICE_FILTER_PARAM.from, isCustom ? form.from : ""],
    [INVOICE_FILTER_PARAM.to, isCustom ? form.to : ""],
    [INVOICE_FILTER_PARAM.q, form.q],
  ];
  const search = new URLSearchParams(
    entries.filter(([, value]) => value !== ""),
  ).toString();
  return search === "" ? "" : `?${search}`;
}

// True when any filter narrows the list: Clear filters shows, and an empty
// list says nothing matches. A custom range counts even with no dates.
export function hasInvoiceListFilter(form: InvoiceListForm): boolean {
  return (
    form.status !== ALL_STATUSES ||
    form.clientId !== null ||
    form.issued !== ANY_TIME ||
    form.q !== ""
  );
}

// The search a filter-bar change applies: the draft with the change, on the
// status tab shown (it may still be loading).
export function getFilterBarSearch(
  draft: InvoiceListForm,
  patch: Partial<InvoiceListForm>,
  status: StatusChoice,
): string {
  return toInvoiceListSearch({ ...draft, ...patch, status });
}

// The filter bar's controls, and the applied search they were seeded from.
export type InvoiceDraftState = {
  draft: InvoiceListForm;
  seededSearch: string;
};

// Re-seeds the controls when the applied filter changes (a tab,
// back/forward, Clear filters); the same state otherwise, keeping what was
// typed.
export function syncInvoiceDraft(
  state: InvoiceDraftState,
  applied: InvoiceListForm,
): InvoiceDraftState {
  const appliedSearch = toInvoiceListSearch(applied);
  if (state.seededSearch === appliedSearch) return state;

  return { draft: applied, seededSearch: appliedSearch };
}
