import { formatIsoDate } from "@/lib/format-date";

// The pure rules for Invoices: dates, money and draft validation. No database
// or server imports, so the New invoice drawer can share them with the server.

export type InvoiceStatus = "OPEN" | "PAID" | "VOID";
// What a screen shows: an Open Invoice past its due date is Overdue.
export type DisplayStatus = "OPEN" | "PAID" | "OVERDUE" | "VOID";
// A calendar date, "YYYY-MM-DD".
export type IsoDate = string;

// What the drawer sends, as typed. A projectId of null or "" means no
// specific Project.
export type InvoiceDraft = {
  issueDate: string;
  dueDate: string;
  projectId: string | null;
  memo: string;
  lineItems: { description: string; amount: string }[];
};

export type ValidInvoiceDraft = {
  issueDate: IsoDate;
  dueDate: IsoDate;
  projectId: string | null;
  memo: string | null;
  lineItems: { description: string; amountCents: number }[];
};

// Copy by field: "issueDate", "dueDate", "projectId", "memo", "lineItems",
// "lineItems.<index>.description", "lineItems.<index>.amount" (index from 0),
// "total" and "paidDate".
export type FieldErrors = Record<string, string>;

export type InvoiceDraftValidation =
  | { isValid: true; draft: ValidInvoiceDraft }
  | { isValid: false; fieldErrors: FieldErrors };

export type AmountParse =
  | { isValid: true; cents: number }
  | { isValid: false; error: "empty" | "format" };

// The same limits as the invoices and line_items CHECKs.
export const LINE_ITEMS_MAX = 50;
export const DESCRIPTION_MAX = 200;
export const MEMO_MAX = 2000;
// $1,000,000.00, the largest amount one Line Item may carry either way.
export const AMOUNT_MAX_CENTS = 100_000_000;
const PAYMENT_TERM_DAYS = 30;
// The longest number search the Admin's Invoice list runs.
export const NUMBER_QUERY_MAX = 20;

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = "YYYY-MM-DD".length;
const NO_YEAR = "0000-";
const CENTS_PER_DOLLAR = 100;
const CENT_DIGITS = 2;
const MS_PER_DAY = 86_400_000;

// Code points, as Postgres's char_length counts them (an emoji is one).
function countCharacters(text: string): number {
  return Array.from(text).length;
}

// UTC midnight of a "YYYY-MM-DD" date: day arithmetic without time zones.
function toUtcDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

// A real calendar date: "2026-02-30" rolls over, so it fails the round trip.
// Year 0000 parses in JavaScript but Postgres has no year 0.
export function isIsoDate(text: string): boolean {
  if (!ISO_DATE_PATTERN.test(text)) return false;
  if (text.startsWith(NO_YEAR)) return false;

  const date = toUtcDate(text);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

// The New York calendar date of `now`: the business day everywhere.
export function getToday(now: Date): IsoDate {
  return formatIsoDate(now);
}

// Empty for an empty or malformed issue date (a cleared date input), so the
// drawer clears the due date instead of throwing.
export function getDefaultDueDate(issueDate: string): IsoDate | "" {
  if (!isIsoDate(issueDate)) return "";

  const due = new Date(
    toUtcDate(issueDate).getTime() + PAYMENT_TERM_DAYS * MS_PER_DAY,
  );
  return due.toISOString().slice(0, ISO_DATE_LENGTH);
}

// ISO dates compare as text.
export function isOverdue(
  status: InvoiceStatus,
  dueDate: IsoDate,
  today: IsoDate,
): boolean {
  return status === "OPEN" && today > dueDate;
}

export function getDisplayStatus(
  status: InvoiceStatus,
  dueDate: IsoDate,
  today: IsoDate,
): DisplayStatus {
  return isOverdue(status, dueDate, today) ? "OVERDUE" : status;
}

// "1,250.00" → 125000. String math, so no float drift: "0.29" is 29 cents.
export function parseAmount(text: string): AmountParse {
  const cleaned = text.trim().replaceAll(",", "");
  if (cleaned === "") return { isValid: false, error: "empty" };
  const match = AMOUNT_PATTERN.exec(cleaned);
  if (match === null) return { isValid: false, error: "format" };

  const [, sign, dollars, fraction = ""] = match;
  const cents =
    Number(dollars) * CENTS_PER_DOLLAR +
    Number(fraction.padEnd(CENT_DIGITS, "0"));
  // `|| 0` turns "-0" into 0, so the zero check sees one zero.
  return { isValid: true, cents: (sign === "-" ? -cents : cents) || 0 };
}

function getIssueDateError(issueDate: string, today: IsoDate): string | null {
  if (!isIsoDate(issueDate)) return "Enter an issue date.";
  if (issueDate > today) return "The issue date can't be in the future.";

  return null;
}

function getDueDateError(dueDate: string, issueDate: string): string | null {
  if (!isIsoDate(dueDate)) return "Enter a due date.";
  if (isIsoDate(issueDate) && dueDate < issueDate) {
    return "The due date can't be before the issue date.";
  }

  return null;
}

function getLineCountError(count: number): string | null {
  if (count === 0) return "Add at least one line item.";
  if (count > LINE_ITEMS_MAX) return "Keep it to 50 line items.";

  return null;
}

function getDescriptionError(description: string): string | null {
  if (description === "") return "Describe this line.";
  if (countCharacters(description) > DESCRIPTION_MAX) {
    return "Keep the description under 200 characters.";
  }

  return null;
}

function getAmountError(amount: AmountParse): string | null {
  if (!amount.isValid) {
    return amount.error === "empty"
      ? "Enter an amount."
      : "Enter an amount like 1,250.00.";
  }
  if (amount.cents === 0) return "The amount can't be zero.";
  if (Math.abs(amount.cents) > AMOUNT_MAX_CENTS) {
    return "Keep each amount under $1,000,000.";
  }

  return null;
}

// `projectIds` are the Client's Projects (Past and frozen ones included).
// `today` is the New York date, so "in the future" matches the business day.
export function validateInvoiceDraft(
  draft: InvoiceDraft,
  projectIds: readonly string[],
  today: IsoDate,
): InvoiceDraftValidation {
  const memo = draft.memo.trim();
  const projectId = draft.projectId === "" ? null : draft.projectId;
  const lines = draft.lineItems.map((line) => ({
    description: line.description.trim(),
    amount: parseAmount(line.amount),
  }));
  const lineErrors = lines.flatMap((line, index) => [
    [`lineItems.${index}.description`, getDescriptionError(line.description)],
    [`lineItems.${index}.amount`, getAmountError(line.amount)],
  ]);
  const amountsCents = lines.flatMap((line) =>
    line.amount.isValid ? [line.amount.cents] : [],
  );
  const totalCents = amountsCents.reduce((sum, cents) => sum + cents, 0);
  // Only once every amount reads: a half-typed draft's total means nothing.
  const isTotalKnown = lines.length > 0 && amountsCents.length === lines.length;
  const errors = [
    ["issueDate", getIssueDateError(draft.issueDate, today)],
    ["dueDate", getDueDateError(draft.dueDate, draft.issueDate)],
    [
      "projectId",
      projectId === null || projectIds.includes(projectId)
        ? null
        : "Choose a project from the list.",
    ],
    [
      "memo",
      countCharacters(memo) > MEMO_MAX
        ? "Keep the memo under 2,000 characters."
        : null,
    ],
    ["lineItems", getLineCountError(lines.length)],
    ...lineErrors,
    [
      "total",
      isTotalKnown && totalCents <= 0
        ? "The total must be more than $0.00."
        : null,
    ],
  ];
  const fieldErrors: FieldErrors = Object.fromEntries(
    errors.filter(([, message]) => message !== null),
  );

  let validation: InvoiceDraftValidation;
  if (Object.keys(fieldErrors).length > 0) {
    validation = { isValid: false, fieldErrors };
  } else {
    validation = {
      isValid: true,
      draft: {
        issueDate: draft.issueDate,
        dueDate: draft.dueDate,
        projectId,
        memo: memo === "" ? null : memo,
        lineItems: lines.map((line) => ({
          description: line.description,
          // Every amount read: an unread one is a field error above.
          amountCents: line.amount.isValid ? line.amount.cents : 0,
        })),
      },
    };
  }
  return validation;
}

// The copy for a paid date, or null when it is the issue date through today.
export function validatePaidDate(
  paidDate: string,
  issueDate: IsoDate,
  today: IsoDate,
): string | null {
  if (!isIsoDate(paidDate)) return "Enter the paid date.";
  if (paidDate < issueDate) {
    return "The paid date can't be before the issue date.";
  }
  if (paidDate > today) return "The paid date can't be in the future.";

  return null;
}
