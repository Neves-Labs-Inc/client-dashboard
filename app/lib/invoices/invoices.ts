import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/db";
import { clients, invoices, lineItems, projects } from "@/lib/db/schema";
import {
  type DisplayStatus,
  type FieldErrors,
  getDisplayStatus,
  getToday,
  type InvoiceDraft,
  type InvoiceStatus,
  type IsoDate,
  isOverdue,
  validateInvoiceDraft,
  validatePaidDate,
} from "@/lib/invoices/invoice-rules";
import type { Result } from "@/lib/result";

// Invoices, for the Client and for the Admin. The Client side runs as
// app_tenant with no user id and names its columns: the grants refuse
// anything else. RLS hides other Clients' and Void Invoices; each read also
// filters client_id and status itself, so a policy regression alone can't
// leak them. The Admin side runs as app_system and scopes by client_id.

export type InvoiceRow = {
  id: string;
  number: string;
  issueDate: IsoDate;
  dueDate: IsoDate;
  totalCents: number;
  status: DisplayStatus;
};

export type InvoiceDetail = InvoiceRow & {
  memo: string | null;
  paidDate: IsoDate | null;
  statusChangedAt: Date;
  project: { id: string; name: string } | null;
  // By position.
  lineItems: { id: string; description: string; amountCents: number }[];
};

export type InvoiceSummary = {
  // Open, Overdue included.
  openCount: number;
  openBalanceCents: number;
  overdueCount: number;
};

export type CreateError = "invalid" | "archived" | "not-found";
export type MarkPaidError = "invalid" | "not-found" | "not-open" | "archived";
export type RevertError = "not-found" | "not-paid" | "archived";
export type VoidError = "not-found" | "not-open" | "archived";
// Field errors ride along with the Result: empty unless `invalid`.
export type FormResult<T, E extends string> = Result<T, E> & {
  fieldErrors: FieldErrors;
};

export type Invoices = {
  // Client side (app_tenant). Never Void.
  // Newest issue date first, then number. `limit` is clamped to
  // 1–MAX_LIST_LIMIT.
  listInvoices(
    clientId: string,
    options?: { limit?: number },
  ): Promise<InvoiceRow[]>;
  // Null for a Void Invoice, another Client's, an unknown or non-UUID id.
  getInvoice(
    clientId: string,
    invoiceId: string,
  ): Promise<InvoiceDetail | null>;
  getInvoiceSummary(clientId: string): Promise<InvoiceSummary>;

  // Admin side (app_system).
  // The New York date: the default issue and paid date in forms.
  getToday(): IsoDate;
  // Void included; any Client, archived included. Same order as listInvoices.
  listClientInvoices(clientId: string): Promise<InvoiceRow[]>;
  // Null unless the Invoice is `clientId`'s.
  getAdminInvoice(
    clientId: string,
    invoiceId: string,
  ): Promise<InvoiceDetail | null>;
  createInvoice(
    clientId: string,
    draft: InvoiceDraft,
  ): Promise<FormResult<{ id: string; number: string }, CreateError>>;
  // `paidDate` as typed, "YYYY-MM-DD".
  markPaid(
    clientId: string,
    invoiceId: string,
    paidDate: string,
  ): Promise<FormResult<null, MarkPaidError>>;
  revertPaid(
    clientId: string,
    invoiceId: string,
  ): Promise<Result<null, RevertError>>;
  voidInvoice(
    clientId: string,
    invoiceId: string,
  ): Promise<Result<null, VoidError>>;
  // Active Clients with at least one Overdue Invoice.
  listOverdueClientIds(): Promise<string[]>;
};

type InvoicesDeps = { db: Db; now?: () => Date };

// The refusal when the Invoice isn't in the status a change starts from.
type WrongStatus = "not-open" | "not-paid";
type StatusError<W extends WrongStatus> = "not-found" | "archived" | W;

// What a status change's refusal depends on.
type StatusFacts = {
  status: InvoiceStatus;
  issueDate: IsoDate;
  isArchived: boolean;
};

type InvoiceFields = {
  id: string;
  number: string;
  issueDate: IsoDate;
  dueDate: IsoDate;
  status: InvoiceStatus;
  totalCents: number;
};

// Shape check only, as in db.ts: a non-UUID id can't name a row, and Postgres
// would reject it as a uuid.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BY_ERROR = {
  invalid: 422,
  "not-found": 404,
  archived: 409,
  "not-open": 409,
  "not-paid": 409,
} as const;

const NO_FIELD_ERRORS: FieldErrors = {};

// The most rows one limited listInvoices call returns.
export const MAX_LIST_LIMIT = 100;

const SEQUENCE_DIGITS = 4;
const YEAR_LENGTH = "YYYY".length;

// The sum of the Invoice's Line Items; bigint sums come back as text.
// Qualified by hand: in a single-table select Drizzle renders
// ${invoices.id} as a bare "id", which would bind to line_items.id here.
const TOTAL_CENTS = sql<number>`(
  select coalesce(sum(li.amount_cents), 0)
  from line_items li
  where li.invoice_id = "invoices"."id"
    and li.client_id = "invoices"."client_id")`.mapWith(Number);

const ROW_COLUMNS = {
  id: invoices.id,
  number: invoices.number,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  status: invoices.status,
  totalCents: TOTAL_CENTS,
};

const NEWEST_FIRST = [desc(invoices.issueDate), desc(invoices.number)];

const NOT_VOID = ne(invoices.status, "VOID");

function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

// A positive integer up to MAX_LIST_LIMIT, whatever a caller passes.
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_LIST_LIMIT;

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

function fail<E extends keyof typeof STATUS_BY_ERROR>(
  operation: string,
  error: E,
  context: Record<string, string>,
): Result<never, E> {
  console.warn(`invoices: ${operation} refused (${error})`, context);
  return { value: null, error, status: STATUS_BY_ERROR[error] };
}

function toInvoiceRow(row: InvoiceFields, today: IsoDate): InvoiceRow {
  return {
    id: row.id,
    number: row.number,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    totalCents: row.totalCents,
    status: getDisplayStatus(row.status, row.dueDate, today),
  };
}

// "NL-0042-2026".
function formatInvoiceNumber(sequence: number, year: string): string {
  return `NL-${String(sequence).padStart(SEQUENCE_DIGITS, "0")}-${year}`;
}

// The issue year's next number. The upsert's row lock serialises concurrent
// creates in the same year until commit, so numbers are consecutive and a
// rolled-back create gives its number back.
async function allocateNumber(tx: Tx, issueDate: IsoDate): Promise<string> {
  const year = issueDate.slice(0, YEAR_LENGTH);
  const {
    rows: [counter],
  } = await tx.execute<{ lastSeq: number }>(sql`
    insert into invoice_counters (year, last_seq) values (${year}, 1)
    on conflict (year)
      do update set last_seq = invoice_counters.last_seq + 1
    returning last_seq as "lastSeq"`);
  return formatInvoiceNumber(counter.lastSeq, year);
}

// One Invoice of `clientId`, with its Line Items. `includeVoid` is false on
// the Client side.
async function readDetail(
  tx: Tx,
  input: { clientId: string; invoiceId: string; includeVoid: boolean },
  today: IsoDate,
): Promise<InvoiceDetail | null> {
  const { clientId, invoiceId } = input;
  const [row] = await tx
    .select({
      ...ROW_COLUMNS,
      memo: invoices.memo,
      paidAt: invoices.paidAt,
      statusChangedAt: invoices.statusChangedAt,
      projectId: invoices.projectId,
      projectName: projects.name,
    })
    .from(invoices)
    .leftJoin(
      projects,
      and(
        eq(projects.id, invoices.projectId),
        eq(projects.clientId, invoices.clientId),
      ),
    )
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.clientId, clientId),
        input.includeVoid ? undefined : NOT_VOID,
      ),
    );
  if (row === undefined) return null;

  const lines = await tx
    .select({
      id: lineItems.id,
      description: lineItems.description,
      amountCents: lineItems.amountCents,
    })
    .from(lineItems)
    .where(
      and(eq(lineItems.invoiceId, invoiceId), eq(lineItems.clientId, clientId)),
    )
    .orderBy(asc(lineItems.position));
  return {
    ...toInvoiceRow(row, today),
    memo: row.memo,
    paidDate: row.paidAt,
    statusChangedAt: row.statusChangedAt,
    project:
      row.projectId === null || row.projectName === null
        ? null
        : { id: row.projectId, name: row.projectName },
    lineItems: lines,
  };
}

async function readStatusFacts(
  tx: Tx,
  clientId: string,
  invoiceId: string,
): Promise<StatusFacts | null> {
  const [row] = await tx
    .select({
      status: invoices.status,
      issueDate: invoices.issueDate,
      archivedAt: clients.archivedAt,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId)));
  return row === undefined
    ? null
    : {
        status: row.status,
        issueDate: row.issueDate,
        isArchived: row.archivedAt !== null,
      };
}

// A status change: from one status, the refusal when the Invoice is in
// another, and what it writes.
type Transition<W extends WrongStatus> = {
  from: InvoiceStatus;
  wrongStatus: W;
  to: InvoiceStatus;
  paidAt: IsoDate | null;
};

// Why `transition` can't happen, or null when it can. Checked in the order
// the Admin would fix them: an unknown Invoice, a read-only Client, then the
// status.
function getStatusRefusal<W extends WrongStatus>(
  facts: StatusFacts | null,
  transition: Transition<W>,
): StatusError<W> | null {
  if (facts === null) return "not-found";
  if (facts.isArchived) return "archived";
  if (facts.status !== transition.from) return transition.wrongStatus;

  return null;
}

// The one guarded UPDATE behind every status change: never another Client's
// Invoice, never an archived Client's, only from `from`. With no row
// changed, a follow-up read says why. The status_changed_at trigger stamps
// the time.
async function changeStatus<W extends WrongStatus>(
  tx: Tx,
  target: { clientId: string; invoiceId: string },
  transition: Transition<W>,
): Promise<StatusError<W> | null> {
  const { clientId, invoiceId } = target;
  const updated = await tx
    .update(invoices)
    .set({ status: transition.to, paidAt: transition.paidAt })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.clientId, clientId),
        eq(invoices.status, transition.from),
        inArray(
          invoices.clientId,
          tx
            .select({ id: clients.id })
            .from(clients)
            .where(isNull(clients.archivedAt)),
        ),
      ),
    )
    .returning({ id: invoices.id });
  if (updated.length > 0) return null;

  const refusal = getStatusRefusal(
    await readStatusFacts(tx, clientId, invoiceId),
    transition,
  );
  // Null only if another write changed the row between the two statements.
  return refusal ?? transition.wrongStatus;
}

function markPaidTransition(paidDate: IsoDate): Transition<"not-open"> {
  return {
    from: "OPEN",
    wrongStatus: "not-open",
    to: "PAID",
    paidAt: paidDate,
  };
}

const REVERT: Transition<"not-paid"> = {
  from: "PAID",
  wrongStatus: "not-paid",
  to: "OPEN",
  paidAt: null,
};

// paid_at is already null on an Open Invoice.
const VOID: Transition<"not-open"> = {
  from: "OPEN",
  wrongStatus: "not-open",
  to: "VOID",
  paidAt: null,
};

export function createInvoices(deps: InvoicesDeps): Invoices {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  function getTodayNow(): IsoDate {
    return getToday(now());
  }

  async function listInvoices(
    clientId: string,
    options: { limit?: number } = {},
  ): Promise<InvoiceRow[]> {
    const today = getTodayNow();
    const rows = await db.withTenant(clientId, (tx) => {
      const query = tx
        .select(ROW_COLUMNS)
        .from(invoices)
        .where(and(eq(invoices.clientId, clientId), NOT_VOID))
        .orderBy(...NEWEST_FIRST);
      return options.limit === undefined
        ? query
        : query.limit(clampLimit(options.limit));
    });
    return rows.map((row) => toInvoiceRow(row, today));
  }

  async function getInvoice(
    clientId: string,
    invoiceId: string,
  ): Promise<InvoiceDetail | null> {
    if (!isUuid(invoiceId)) return null;

    const today = getTodayNow();
    return db.withTenant(clientId, (tx) =>
      readDetail(tx, { clientId, invoiceId, includeVoid: false }, today),
    );
  }

  async function getInvoiceSummary(clientId: string): Promise<InvoiceSummary> {
    const today = getTodayNow();
    const rows = await db.withTenant(clientId, (tx) =>
      tx
        .select({ dueDate: invoices.dueDate, totalCents: TOTAL_CENTS })
        .from(invoices)
        .where(
          and(eq(invoices.clientId, clientId), eq(invoices.status, "OPEN")),
        ),
    );
    return {
      openCount: rows.length,
      openBalanceCents: rows.reduce((sum, row) => sum + row.totalCents, 0),
      overdueCount: rows.filter((row) => isOverdue("OPEN", row.dueDate, today))
        .length,
    };
  }

  async function listClientInvoices(clientId: string): Promise<InvoiceRow[]> {
    if (!isUuid(clientId)) return [];

    const today = getTodayNow();
    const rows = await db.withSystem((tx) =>
      tx
        .select(ROW_COLUMNS)
        .from(invoices)
        .where(eq(invoices.clientId, clientId))
        .orderBy(...NEWEST_FIRST),
    );
    return rows.map((row) => toInvoiceRow(row, today));
  }

  async function getAdminInvoice(
    clientId: string,
    invoiceId: string,
  ): Promise<InvoiceDetail | null> {
    if (!isUuid(clientId) || !isUuid(invoiceId)) return null;

    const today = getTodayNow();
    return db.withSystem((tx) =>
      readDetail(tx, { clientId, invoiceId, includeVoid: true }, today),
    );
  }

  async function createInvoice(
    clientId: string,
    draft: InvoiceDraft,
  ): Promise<FormResult<{ id: string; number: string }, CreateError>> {
    const context = { clientId };
    if (!isUuid(clientId)) {
      return {
        ...fail("create", "not-found", context),
        fieldErrors: NO_FIELD_ERRORS,
      };
    }

    const today = getTodayNow();
    // One transaction, not nested: line_items_only_with_invoice refuses Line
    // Items written outside their Invoice's own transaction, and a failure
    // anywhere gives the number back.
    const outcome = await db.withSystem(
      async (
        tx,
      ): Promise<
        | { error: CreateError; fieldErrors: FieldErrors }
        | { error: null; id: string; number: string }
      > => {
        // Held to commit, so the Client can't be archived mid-create.
        const [client] = await tx
          .select({ archivedAt: clients.archivedAt })
          .from(clients)
          .where(eq(clients.id, clientId))
          .for("share");
        if (client === undefined) {
          return { error: "not-found", fieldErrors: NO_FIELD_ERRORS };
        }
        if (client.archivedAt !== null) {
          return { error: "archived", fieldErrors: NO_FIELD_ERRORS };
        }
        const projectIds = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.clientId, clientId))
          .then((rows) => rows.map((row) => row.id));
        const validation = validateInvoiceDraft(draft, projectIds, today);
        if (!validation.isValid) {
          return { error: "invalid", fieldErrors: validation.fieldErrors };
        }

        const valid = validation.draft;
        const number = await allocateNumber(tx, valid.issueDate);
        // Explicit columns: app_system may not set status_changed_at, and
        // Drizzle's insert() sends `default` for every column.
        const {
          rows: [invoice],
        } = await tx.execute<{ id: string }>(sql`
          insert into ${invoices}
            (client_id, project_id, number, issue_date, due_date, memo)
          values
            (${clientId}, ${valid.projectId}, ${number}, ${valid.issueDate},
             ${valid.dueDate}, ${valid.memo})
          returning id`);
        const lineValues = valid.lineItems.map(
          (line, index) =>
            sql`(${clientId}, ${invoice.id}, ${index + 1},
              ${line.description}, ${line.amountCents})`,
        );
        await tx.execute(sql`
          insert into ${lineItems}
            (client_id, invoice_id, position, description, amount_cents)
          values ${sql.join(lineValues, sql`, `)}`);
        return { error: null, id: invoice.id, number };
      },
    );

    let result: FormResult<{ id: string; number: string }, CreateError>;
    if (outcome.error === null) {
      result = {
        value: { id: outcome.id, number: outcome.number },
        error: null,
        status: 201,
        fieldErrors: NO_FIELD_ERRORS,
      };
    } else {
      result = {
        ...fail("create", outcome.error, context),
        fieldErrors: outcome.fieldErrors,
      };
    }
    return result;
  }

  async function markPaid(
    clientId: string,
    invoiceId: string,
    paidDate: string,
  ): Promise<FormResult<null, MarkPaidError>> {
    const context = { clientId, invoiceId };
    if (!isUuid(clientId) || !isUuid(invoiceId)) {
      return {
        ...fail("mark-paid", "not-found", context),
        fieldErrors: NO_FIELD_ERRORS,
      };
    }

    const today = getTodayNow();
    // Refusals that make the date moot (a stale detail) come before its
    // field error; the date's bounds need the issue date.
    const outcome = await db.withSystem(
      async (
        tx,
      ): Promise<{ error: MarkPaidError | null; fieldErrors: FieldErrors }> => {
        const transition = markPaidTransition(paidDate);
        const facts = await readStatusFacts(tx, clientId, invoiceId);
        const refusal = getStatusRefusal(facts, transition);
        if (facts === null || refusal !== null) {
          return {
            error: refusal ?? "not-found",
            fieldErrors: NO_FIELD_ERRORS,
          };
        }
        const message = validatePaidDate(paidDate, facts.issueDate, today);
        if (message !== null) {
          return { error: "invalid", fieldErrors: { paidDate: message } };
        }

        const error = await changeStatus(
          tx,
          { clientId, invoiceId },
          transition,
        );
        return { error, fieldErrors: NO_FIELD_ERRORS };
      },
    );

    let result: FormResult<null, MarkPaidError>;
    if (outcome.error === null) {
      result = {
        value: null,
        error: null,
        status: 200,
        fieldErrors: NO_FIELD_ERRORS,
      };
    } else {
      result = {
        ...fail("mark-paid", outcome.error, context),
        fieldErrors: outcome.fieldErrors,
      };
    }
    return result;
  }

  async function revertPaid(
    clientId: string,
    invoiceId: string,
  ): Promise<Result<null, RevertError>> {
    const context = { clientId, invoiceId };
    if (!isUuid(clientId) || !isUuid(invoiceId)) {
      return fail("revert", "not-found", context);
    }

    const error = await db.withSystem((tx) =>
      changeStatus(tx, { clientId, invoiceId }, REVERT),
    );
    return error === null
      ? { value: null, error: null, status: 200 }
      : fail("revert", error, context);
  }

  async function voidInvoice(
    clientId: string,
    invoiceId: string,
  ): Promise<Result<null, VoidError>> {
    const context = { clientId, invoiceId };
    if (!isUuid(clientId) || !isUuid(invoiceId)) {
      return fail("void", "not-found", context);
    }

    const error = await db.withSystem((tx) =>
      changeStatus(tx, { clientId, invoiceId }, VOID),
    );
    return error === null
      ? { value: null, error: null, status: 200 }
      : fail("void", error, context);
  }

  async function listOverdueClientIds(): Promise<string[]> {
    const today = getTodayNow();
    const rows = await db.withSystem((tx) =>
      tx
        .selectDistinct({ clientId: invoices.clientId })
        .from(invoices)
        .innerJoin(clients, eq(clients.id, invoices.clientId))
        .where(
          and(
            isNull(clients.archivedAt),
            eq(invoices.status, "OPEN"),
            lt(invoices.dueDate, today),
          ),
        ),
    );
    return rows.map((row) => row.clientId);
  }

  return {
    listInvoices,
    getInvoice,
    getInvoiceSummary,
    getToday: getTodayNow,
    listClientInvoices,
    getAdminInvoice,
    createInvoice,
    markPaid,
    revertPaid,
    voidInvoice,
    listOverdueClientIds,
  };
}
