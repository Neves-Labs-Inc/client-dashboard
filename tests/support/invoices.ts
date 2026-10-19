import { sql } from "drizzle-orm";
import type pg from "pg";
import type { Tx } from "@/lib/db/db";
import type { invoices } from "@/lib/db/schema";

type InvoiceStatus = typeof invoices.$inferInsert.status;

export type LineItemInput = { description?: string; amountCents: number };

type InvoiceInput = {
  clientId: string;
  projectId?: string | null;
  // Omitted, the next number in the issue year's sequence (invoice_counters),
  // so seeds never collide on the unique number.
  number?: string;
  // "YYYY-MM-DD".
  issueDate?: string;
  dueDate?: string;
  memo?: string | null;
  status?: InvoiceStatus;
  // Omitted on a Paid Invoice, its issue date.
  paidAt?: string | null;
  statusChangedAt?: Date;
  lineItems?: LineItemInput[];
};

export type InsertedInvoice = { id: string; number: string };

const DEFAULT_ISSUE_DATE = "2026-03-02";
const DEFAULT_DUE_DATE = "2026-04-01";
const DEFAULT_LINE_ITEMS: LineItemInput[] = [{ amountCents: 125_000 }];
const SEQUENCE_DIGITS = 4;
// "YYYY" of a "YYYY-MM-DD" date.
const YEAR_LENGTH = 4;

// As app_system, so it may set any status. Explicit-column SQL: Drizzle's
// insert() sends `default` for every column, which column grants refuse.
// The Invoice and its Line Items go in the caller's transaction, so the
// commit-time check sees them together.
export async function insertInvoice(
  tx: Tx,
  input: InvoiceInput,
): Promise<InsertedInvoice> {
  const issueDate = input.issueDate ?? DEFAULT_ISSUE_DATE;
  const status = input.status ?? "OPEN";
  const paidAt = input.paidAt ?? (status === "PAID" ? issueDate : null);
  const number = input.number ?? (await allocateNumber(tx, issueDate));

  const {
    rows: [invoice],
  } = await tx.execute<{ id: string }>(
    sql`insert into invoices
      (client_id, project_id, number, issue_date, due_date, memo, status,
        paid_at, status_changed_at)
      values (${input.clientId}, ${input.projectId ?? null}, ${number},
        ${issueDate}, ${input.dueDate ?? DEFAULT_DUE_DATE},
        ${input.memo ?? null}, ${status}, ${paidAt},
        coalesce(${input.statusChangedAt?.toISOString() ?? null}::timestamptz,
          now()))
      returning id`,
  );
  await insertLineItems(tx, {
    clientId: input.clientId,
    invoiceId: invoice.id,
    lineItems: input.lineItems ?? DEFAULT_LINE_ITEMS,
  });
  return { id: invoice.id, number };
}

// Positions follow the array order, from 1.
export async function insertLineItems(
  tx: Tx,
  input: { clientId: string; invoiceId: string; lineItems: LineItemInput[] },
): Promise<void> {
  for (const [index, lineItem] of input.lineItems.entries()) {
    await tx.execute(
      sql`insert into line_items
        (client_id, invoice_id, position, description, amount_cents)
        values (${input.clientId}, ${input.invoiceId}, ${index + 1},
          ${lineItem.description ?? "Design work"}, ${lineItem.amountCents})`,
    );
  }
}

// The same upsert the create path uses: the row lock serialises concurrent
// seeds in the same year.
async function allocateNumber(tx: Tx, issueDate: string): Promise<string> {
  const year = issueDate.slice(0, YEAR_LENGTH);
  const {
    rows: [counter],
  } = await tx.execute<{ lastSeq: number }>(
    sql`insert into invoice_counters (year, last_seq) values (${year}, 1)
      on conflict (year)
        do update set last_seq = invoice_counters.last_seq + 1
      returning last_seq as "lastSeq"`,
  );
  return `NL-${String(counter.lastSeq).padStart(SEQUENCE_DIGITS, "0")}-${year}`;
}

// As the owner: app_system has no DELETE on either table. Line Items first,
// they reference their Invoice.
export async function deleteInvoices(
  owner: pg.Client,
  clientIds: string[],
): Promise<void> {
  await owner.query(
    "delete from line_items where client_id = any($1::uuid[])",
    [clientIds],
  );
  await owner.query("delete from invoices where client_id = any($1::uuid[])", [
    clientIds,
  ]);
}

// As the owner, once before any suite (global setup): restarts every year's
// sequence after the highest number still in use, so seeds stay
// collision-free across parallel files without the counters growing from run
// to run. Invoices a crashed run left behind keep their numbers.
export async function resetInvoiceCounters(owner: pg.Client): Promise<void> {
  await owner.query("begin");
  try {
    await owner.query("delete from invoice_counters");
    await owner.query(
      `insert into invoice_counters (year, last_seq)
        select right(number, 4)::int, max(substring(number from 4 for 4)::int)
        from invoices group by 1`,
    );
    await owner.query("commit");
  } catch (error) {
    await owner.query("rollback");
    throw error;
  }
}
