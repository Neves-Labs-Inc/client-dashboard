import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "@/lib/db/db";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { insertProject } from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import {
  deleteInvoices,
  insertInvoice,
  insertLineItems,
} from "../../support/invoices";
import { getPgError } from "../../support/pg-error";

// The Invoice write backstop as app_system (the Admin's role): CHECKs, the
// grants that keep an issued Invoice from being edited, the commit-time Line
// Item check and the triggers. Tenant access is in rls.test.ts.

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const INSUFFICIENT_PRIVILEGE = "42501";
const MEMO_MAX = 2000;
const DESCRIPTION_MAX = 200;
const AMOUNT_MAX_CENTS = 100_000_000;
// Seeded status time, far enough back that a change shows.
const SEEDED_STATUS_CHANGED_AT = new Date("2020-01-01T00:00:00Z");

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const clientId = randomUUID();

beforeAll(async () => {
  await db.withSystem((tx) => insertClients(tx, [clientId]));
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await deleteInvoices(owner, [clientId]);
    await owner.query("delete from projects where client_id = $1", [clientId]);
    await deleteClients(owner, [clientId]);
  } finally {
    await owner.end();
    await db.close();
  }
});

type Outcome = "applied" | { code: string; message: string };

// Runs the work in one app_system transaction, commit included, and reports
// a refusal instead of throwing.
async function runAsSystem(
  work: Parameters<typeof db.withSystem>[0],
): Promise<Outcome> {
  return db
    .withSystem(work)
    .then(() => "applied" as const)
    .catch((error: unknown) => {
      const pgError = getPgError(error);
      if (pgError === null) throw error;
      return pgError;
    });
}

function seedInvoice(
  input: Omit<Parameters<typeof insertInvoice>[1], "clientId"> = {},
): Promise<{ id: string; number: string }> {
  return db.withSystem((tx) =>
    insertInvoice(tx, {
      clientId,
      statusChangedAt: SEEDED_STATUS_CHANGED_AT,
      ...input,
    }),
  );
}

function insertForClient(
  input: Omit<Parameters<typeof insertInvoice>[1], "clientId">,
): Promise<Outcome> {
  return runAsSystem((tx) => insertInvoice(tx, { clientId, ...input }));
}

function execute(statement: SQL): Promise<Outcome> {
  return runAsSystem((tx) => tx.execute(statement));
}

async function readInvoice(invoiceId: string): Promise<{
  number: string;
  status: string;
  paidAt: string | null;
  projectId: string | null;
  statusChangedAt: Date;
}> {
  const {
    rows: [row],
  } = await db.withSystem((tx) =>
    tx.execute<{
      number: string;
      status: string;
      paidAt: string | null;
      projectId: string | null;
      statusChangedAt: string;
    }>(
      sql`select number, status, paid_at::text as "paidAt",
          project_id as "projectId", status_changed_at as "statusChangedAt"
        from invoices where id = ${invoiceId}`,
    ),
  );
  return { ...row, statusChangedAt: new Date(row.statusChangedAt) };
}

function checkViolation(constraint: string): unknown {
  return {
    code: CHECK_VIOLATION,
    message: expect.stringContaining(constraint),
  };
}

const PERMISSION_DENIED = {
  code: INSUFFICIENT_PRIVILEGE,
  message: expect.stringMatching(/permission denied/),
};

describe("invoices CHECKs", () => {
  it("refuses a Paid Invoice without a paid date", async () => {
    const outcome = await execute(
      sql`insert into invoices (client_id, number, issue_date, due_date, status)
        values (${clientId}, 'NL-9001-2026', '2026-03-02', '2026-04-01', 'PAID')`,
    );

    expect(outcome).toEqual(checkViolation("invoices_paid_at_status"));
  });

  it.each(["OPEN", "VOID"] as const)(
    "refuses a paid date on a %s Invoice",
    async (status) => {
      const outcome = await insertForClient({ status, paidAt: "2026-03-10" });

      expect(outcome).toEqual(checkViolation("invoices_paid_at_status"));
    },
  );

  it("refuses a paid date before the issue date", async () => {
    const outcome = await insertForClient({
      status: "PAID",
      issueDate: "2026-03-02",
      paidAt: "2026-03-01",
    });

    expect(outcome).toEqual(checkViolation("invoices_paid_after_issue"));
  });

  it("allows a paid date on the issue date", async () => {
    const outcome = await insertForClient({
      status: "PAID",
      issueDate: "2026-03-02",
      paidAt: "2026-03-02",
    });

    expect(outcome).toBe("applied");
  });

  it("refuses a due date before the issue date", async () => {
    const outcome = await insertForClient({
      issueDate: "2026-03-02",
      dueDate: "2026-03-01",
    });

    expect(outcome).toEqual(checkViolation("invoices_due_after_issue"));
  });

  it.each([
    "INV-1",
    "NL-1-2026",
    "NL-00001-2026",
    "nl-0001-2026",
    "NL-0001-26",
  ])("refuses the number %s", async (number) => {
    const outcome = await insertForClient({ number, issueDate: "2026-03-02" });

    expect(outcome).toEqual(checkViolation("invoices_number_format"));
  });

  it("refuses a number whose year isn't the issue year", async () => {
    const outcome = await insertForClient({
      number: "NL-0001-2025",
      issueDate: "2026-03-02",
    });

    expect(outcome).toEqual(checkViolation("invoices_number_format"));
  });

  it("refuses a duplicate number", async () => {
    const { number } = await seedInvoice();

    const outcome = await insertForClient({ number });

    expect(outcome).toEqual({
      code: UNIQUE_VIOLATION,
      message: expect.stringContaining("invoices_number_unique"),
    });
  });

  it.each([
    { memo: "", label: "an empty" },
    { memo: "x".repeat(MEMO_MAX + 1), label: "an over-long" },
  ])("refuses $label memo", async ({ memo }) => {
    const outcome = await insertForClient({ memo });

    expect(outcome).toEqual(checkViolation("invoices_memo_length"));
  });

  it("allows a memo at its longest", async () => {
    const outcome = await insertForClient({ memo: "x".repeat(MEMO_MAX) });

    expect(outcome).toBe("applied");
  });
});

describe("line_items CHECKs", () => {
  it.each([
    { amountCents: 0, label: "zero" },
    { amountCents: AMOUNT_MAX_CENTS + 1, label: "over $1,000,000" },
    { amountCents: -(AMOUNT_MAX_CENTS + 1), label: "under -$1,000,000" },
  ])("refuses an amount of $label", async ({ amountCents }) => {
    const outcome = await insertForClient({
      lineItems: [{ amountCents: 1000 }, { amountCents }],
    });

    expect(outcome).toEqual(checkViolation("line_items_amount_range"));
  });

  it("allows an amount of exactly $1,000,000", async () => {
    const outcome = await insertForClient({
      lineItems: [{ amountCents: AMOUNT_MAX_CENTS }],
    });

    expect(outcome).toBe("applied");
  });

  it.each([
    { description: "", label: "an empty" },
    { description: "x".repeat(DESCRIPTION_MAX + 1), label: "an over-long" },
  ])("refuses $label description", async ({ description }) => {
    const outcome = await insertForClient({
      lineItems: [{ description, amountCents: 1000 }],
    });

    expect(outcome).toEqual(checkViolation("line_items_description_length"));
  });

  it("refuses a 51st Line Item", async () => {
    const lineItems = Array.from({ length: 51 }, () => ({ amountCents: 100 }));

    const outcome = await insertForClient({ lineItems });

    expect(outcome).toEqual(checkViolation("line_items_position_range"));
  });
});

describe("the commit-time Line Item check", () => {
  it("refuses an Invoice with no Line Items", async () => {
    const outcome = await insertForClient({ lineItems: [] });

    expect(outcome).toEqual(checkViolation("needs at least one Line Item"));
  });

  it("refuses an Invoice whose total is zero", async () => {
    const outcome = await insertForClient({
      lineItems: [{ amountCents: 5000 }, { amountCents: -5000 }],
    });

    expect(outcome).toEqual(checkViolation("total above zero"));
  });

  it("refuses an Invoice whose total is negative", async () => {
    const outcome = await insertForClient({
      lineItems: [{ amountCents: -5000 }],
    });

    expect(outcome).toEqual(checkViolation("total above zero"));
  });

  it("commits an Invoice whose positive total includes a credit", async () => {
    const outcome = await insertForClient({
      lineItems: [{ amountCents: 100_000 }, { amountCents: -25_000 }],
    });

    expect(outcome).toBe("applied");
  });

  it("checks at commit, so Line Items may follow the Invoice", async () => {
    const outcome = await runAsSystem(async (tx) => {
      const invoice = await insertInvoice(tx, { clientId, lineItems: [] });
      await insertLineItems(tx, {
        clientId,
        invoiceId: invoice.id,
        lineItems: [{ amountCents: 1000 }],
      });
    });

    expect(outcome).toBe("applied");
  });
});

describe("invoices as app_system", () => {
  it.each([
    { column: "number", value: "NL-9999-2026" },
    { column: "issue_date", value: "2026-03-01" },
    { column: "due_date", value: "2026-05-01" },
    { column: "memo", value: "Changed" },
    { column: "project_id", value: null },
    { column: "client_id", value: randomUUID() },
    { column: "status_changed_at", value: "2019-01-01T00:00:00Z" },
  ])("refuses updating $column", async ({ column, value }) => {
    const { id } = await seedInvoice();

    const outcome = await execute(
      sql`update invoices set ${sql.identifier(column)} = ${value}
        where id = ${id}`,
    );

    expect(outcome).toEqual(PERMISSION_DENIED);
  });

  it("refuses deleting an Invoice", async () => {
    const { id } = await seedInvoice();

    const outcome = await execute(sql`delete from invoices where id = ${id}`);

    expect(outcome).toEqual(PERMISSION_DENIED);
  });

  it("marks an Invoice Paid and reverts it", async () => {
    const { id } = await seedInvoice({ issueDate: "2026-03-02" });

    const paid = await execute(
      sql`update invoices set status = 'PAID', paid_at = '2026-03-20'
        where id = ${id}`,
    );
    const afterPaid = await readInvoice(id);
    const reverted = await execute(
      sql`update invoices set status = 'OPEN', paid_at = null where id = ${id}`,
    );
    const afterRevert = await readInvoice(id);

    expect([paid, reverted]).toEqual(["applied", "applied"]);
    expect(afterPaid).toMatchObject({ status: "PAID", paidAt: "2026-03-20" });
    expect(afterRevert).toMatchObject({ status: "OPEN", paidAt: null });
  });

  it.each([
    {
      label: "updating",
      statement: sql`update line_items set amount_cents = 1`,
    },
    { label: "deleting", statement: sql`delete from line_items` },
  ])("refuses $label Line Items", async ({ statement }) => {
    const { id } = await seedInvoice();

    const outcome = await execute(sql`${statement} where invoice_id = ${id}`);

    expect(outcome).toEqual(PERMISSION_DENIED);
  });
});

describe("a Void Invoice", () => {
  it.each([
    { status: "OPEN", paidAt: null },
    { status: "PAID", paidAt: "2026-03-20" },
  ])("can't go back to $status", async ({ status, paidAt }) => {
    const { id } = await seedInvoice({ status: "VOID" });

    const outcome = await execute(
      sql`update invoices set status = ${status}, paid_at = ${paidAt}
        where id = ${id}`,
    );

    expect(outcome).toEqual(checkViolation("Void is final"));
    expect((await readInvoice(id)).status).toBe("VOID");
  });
});

describe("adding Line Items later", () => {
  it("refuses a Line Item for an Invoice issued in an earlier transaction", async () => {
    const { id } = await seedInvoice({ lineItems: [{ amountCents: 1000 }] });

    // A credit that would take the total below zero, after the commit check.
    const outcome = await execute(
      sql`insert into line_items
        (client_id, invoice_id, position, description, amount_cents)
        values (${clientId}, ${id}, 2, 'Credit', -5000)`,
    );

    expect(outcome).toEqual(
      checkViolation("Line Items are added only with their Invoice"),
    );
  });
});

describe("invoices status_changed_at", () => {
  it("moves when the status changes", async () => {
    const { id } = await seedInvoice();

    await execute(sql`update invoices set status = 'VOID' where id = ${id}`);

    const { statusChangedAt } = await readInvoice(id);
    expect(statusChangedAt.getTime()).toBeGreaterThan(
      SEEDED_STATUS_CHANGED_AT.getTime(),
    );
  });

  it("stays when an update leaves the status as it was", async () => {
    const { id } = await seedInvoice({
      status: "PAID",
      issueDate: "2026-03-02",
      paidAt: "2026-03-05",
    });

    await execute(
      sql`update invoices set status = 'PAID', paid_at = '2026-03-06'
        where id = ${id}`,
    );

    expect(await readInvoice(id)).toMatchObject({
      paidAt: "2026-03-06",
      statusChangedAt: SEEDED_STATUS_CHANGED_AT,
    });
  });
});

describe("deleting an Invoice's Project", () => {
  it("clears the Invoice's project and keeps the Invoice", async () => {
    const projectId = await db.withSystem((tx) =>
      insertProject(tx, { clientId }),
    );
    const { id, number } = await seedInvoice({ projectId });

    await db.withSystem((tx) =>
      tx.execute(sql`delete from projects where id = ${projectId}`),
    );

    expect(await readInvoice(id)).toMatchObject({ number, projectId: null });
  });
});
