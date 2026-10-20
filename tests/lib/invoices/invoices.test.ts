import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, type Tx } from "@/lib/db/db";
import { clients } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import type { InvoiceDraft } from "@/lib/invoices/invoice-rules";
import { createInvoices } from "@/lib/invoices/invoices";
import { insertProject } from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import { deleteInvoices, insertInvoice } from "../../support/invoices";

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
// 02:00 UTC: already Oct 20 in UTC, still Oct 19 in New York.
const NOW = new Date("2026-10-20T02:00:00Z");
const TODAY = "2026-10-19";
const YESTERDAY = "2026-10-18";
const invoices = createInvoices({ db, now: () => NOW });
const createdClientIds: string[] = [];

const DRAFT: InvoiceDraft = {
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  projectId: null,
  memo: "",
  lineItems: [{ description: "Design work", amount: "1,250.00" }],
};

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await deleteInvoices(owner, createdClientIds);
    await owner.query("delete from projects where client_id = any($1)", [
      createdClientIds,
    ]);
    await deleteClients(owner, createdClientIds);
  } finally {
    await owner.end();
    await db.close();
  }
});

async function seedClient(
  seed: (tx: Tx, clientId: string) => Promise<void> = async () => {},
): Promise<string> {
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    await seed(tx, clientId);
  });
  return clientId;
}

function seedInvoice(
  input: Parameters<typeof insertInvoice>[1],
): Promise<string> {
  return db
    .withSystem((tx) => insertInvoice(tx, input))
    .then((invoice) => invoice.id);
}

async function archiveClient(clientId: string): Promise<void> {
  await db.withSystem((tx) =>
    tx
      .update(clients)
      .set({ archivedAt: new Date() })
      .where(eq(clients.id, clientId)),
  );
}

async function create(
  clientId: string,
  draft: Partial<InvoiceDraft> = {},
): Promise<{ id: string; number: string }> {
  const result = await invoices.createInvoice(clientId, {
    ...DRAFT,
    ...draft,
  });
  if (result.value === null) {
    throw new Error(`create failed: ${result.error}`);
  }
  return result.value;
}

describe("createInvoice numbering", () => {
  it("numbers a year's first Invoice 0001 and the next 0002, in that year's sequence", async () => {
    const clientId = await seedClient();

    const first = await create(clientId, {
      issueDate: "2001-03-04",
      dueDate: "2001-04-03",
    });
    const second = await create(clientId, {
      issueDate: "2001-12-31",
      dueDate: "2002-01-30",
    });

    expect(first.number).toBe("NL-0001-2001");
    expect(second.number).toBe("NL-0002-2001");
  });

  it("shares one sequence across Clients", async () => {
    const clientA = await seedClient();
    const clientB = await seedClient();
    const year = { issueDate: "2002-05-01", dueDate: "2002-05-31" };

    const first = await create(clientA, year);
    const second = await create(clientB, year);

    expect([first.number, second.number]).toEqual([
      "NL-0001-2002",
      "NL-0002-2002",
    ]);
  });

  it("gives two concurrent creates distinct consecutive numbers", async () => {
    const clientId = await seedClient();
    const year = { issueDate: "2003-06-01", dueDate: "2003-07-01" };

    const created = await Promise.all([
      create(clientId, year),
      create(clientId, year),
    ]);

    expect(created.map((invoice) => invoice.number).toSorted()).toEqual([
      "NL-0001-2003",
      "NL-0002-2003",
    ]);
  });
});

describe("createInvoice", () => {
  it("issues an Open Invoice with its Line Items in order", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id, name: "Website" });
    });

    const { id, number } = await create(clientId, {
      projectId,
      memo: "  Thanks!  ",
      lineItems: [
        { description: "Design work", amount: "1,250.00" },
        { description: " Credit ", amount: "-250.50" },
      ],
    });

    expect(await invoices.getAdminInvoice(clientId, id)).toMatchObject({
      id,
      number,
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
      totalCents: 99_950,
      status: "OPEN",
      memo: "Thanks!",
      paidDate: null,
      project: { id: projectId, name: "Website" },
      lineItems: [
        { description: "Design work", amountCents: 125_000 },
        { description: "Credit", amountCents: -25_050 },
      ],
    });
  });

  it("accepts a frozen Project of the Client", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, {
        clientId: id,
        unlinkedAt: new Date(),
      });
    });

    const result = await invoices.createInvoice(clientId, {
      ...DRAFT,
      projectId,
    });

    expect(result.error).toBeNull();
  });

  it("refuses an invalid draft with field errors and writes nothing", async () => {
    let otherProjectId = "";
    await seedClient(async (tx, id) => {
      otherProjectId = await insertProject(tx, { clientId: id });
    });
    const clientId = await seedClient();

    const result = await invoices.createInvoice(clientId, {
      ...DRAFT,
      issueDate: "2026-10-20",
      projectId: otherProjectId,
    });

    expect(result).toEqual({
      value: null,
      error: "invalid",
      status: 422,
      fieldErrors: {
        issueDate: "The issue date can't be in the future.",
        projectId: "Choose a project from the list.",
      },
    });
    expect(await invoices.listClientInvoices(clientId)).toEqual([]);
  });

  it("allows an issue date of today in New York, though UTC is a day ahead", async () => {
    const clientId = await seedClient();

    const result = await invoices.createInvoice(clientId, {
      ...DRAFT,
      issueDate: TODAY,
      dueDate: TODAY,
    });

    expect(result.error).toBeNull();
  });

  it("refuses an archived Client", async () => {
    const clientId = await seedClient();
    await archiveClient(clientId);

    const result = await invoices.createInvoice(clientId, DRAFT);

    expect(result).toMatchObject({ error: "archived", status: 409 });
    expect(await invoices.listClientInvoices(clientId)).toEqual([]);
  });

  it("refuses an unknown or non-UUID Client", async () => {
    expect(await invoices.createInvoice(randomUUID(), DRAFT)).toMatchObject({
      error: "not-found",
      status: 404,
    });
    expect(await invoices.createInvoice("nope", DRAFT)).toMatchObject({
      error: "not-found",
      status: 404,
    });
  });
});

describe("markPaid, revertPaid and voidInvoice", () => {
  it("marks an Open Invoice paid, then reverts it to Open", async () => {
    const clientId = await seedClient();
    const invoiceId = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
    });

    const paid = await invoices.markPaid(clientId, invoiceId, "2026-10-05");
    const afterPaid = await invoices.getAdminInvoice(clientId, invoiceId);
    const reverted = await invoices.revertPaid(clientId, invoiceId);
    const afterRevert = await invoices.getAdminInvoice(clientId, invoiceId);

    expect(paid).toMatchObject({ value: null, error: null, status: 200 });
    expect(afterPaid).toMatchObject({ status: "PAID", paidDate: "2026-10-05" });
    expect(reverted).toEqual({ value: null, error: null, status: 200 });
    expect(afterRevert).toMatchObject({ status: "OPEN", paidDate: null });
  });

  it("marks an Overdue Invoice paid", async () => {
    const clientId = await seedClient();
    const invoiceId = await seedInvoice({ clientId, dueDate: YESTERDAY });

    const result = await invoices.markPaid(clientId, invoiceId, TODAY);

    expect(result.error).toBeNull();
  });

  it("voids an Open Invoice and stamps when", async () => {
    const clientId = await seedClient();
    const invoiceId = await seedInvoice({
      clientId,
      statusChangedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await invoices.voidInvoice(clientId, invoiceId);

    expect(result).toEqual({ value: null, error: null, status: 200 });
    const detail = await invoices.getAdminInvoice(clientId, invoiceId);
    expect(detail?.status).toBe("VOID");
    expect(detail?.statusChangedAt.getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
  });

  it("refuses a paid date outside the issue date through today", async () => {
    const clientId = await seedClient();
    const invoiceId = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: "2026-10-31",
    });

    const early = await invoices.markPaid(clientId, invoiceId, "2026-09-30");
    const future = await invoices.markPaid(clientId, invoiceId, "2026-10-20");
    const missing = await invoices.markPaid(clientId, invoiceId, "");

    expect(early).toEqual({
      value: null,
      error: "invalid",
      status: 422,
      fieldErrors: {
        paidDate: "The paid date can't be before the issue date.",
      },
    });
    expect(future.fieldErrors).toEqual({
      paidDate: "The paid date can't be in the future.",
    });
    expect(missing.fieldErrors).toEqual({ paidDate: "Enter the paid date." });
    expect((await invoices.getAdminInvoice(clientId, invoiceId))?.status).toBe(
      "OPEN",
    );
  });

  it("refuses from the wrong status", async () => {
    const clientId = await seedClient();
    const paidId = await seedInvoice({ clientId, status: "PAID" });
    const openId = await seedInvoice({ clientId });
    const voidId = await seedInvoice({ clientId, status: "VOID" });

    expect(await invoices.markPaid(clientId, paidId, TODAY)).toMatchObject({
      error: "not-open",
      status: 409,
    });
    expect(await invoices.voidInvoice(clientId, paidId)).toMatchObject({
      error: "not-open",
      status: 409,
    });
    expect(await invoices.revertPaid(clientId, openId)).toMatchObject({
      error: "not-paid",
      status: 409,
    });
    expect(await invoices.voidInvoice(clientId, voidId)).toMatchObject({
      error: "not-open",
    });
    expect(await invoices.revertPaid(clientId, voidId)).toMatchObject({
      error: "not-paid",
    });
  });

  it("refuses an archived Client's Invoices", async () => {
    const clientId = await seedClient();
    const openId = await seedInvoice({ clientId });
    const paidId = await seedInvoice({ clientId, status: "PAID" });
    await archiveClient(clientId);

    expect(await invoices.markPaid(clientId, openId, TODAY)).toMatchObject({
      error: "archived",
      status: 409,
    });
    expect(await invoices.voidInvoice(clientId, openId)).toMatchObject({
      error: "archived",
    });
    expect(await invoices.revertPaid(clientId, paidId)).toMatchObject({
      error: "archived",
    });
    // Still Open: due in April, so shown Overdue.
    expect((await invoices.getAdminInvoice(clientId, openId))?.status).toBe(
      "OVERDUE",
    );
  });

  it("calls another Client's, an unknown and a non-UUID Invoice not found", async () => {
    const clientId = await seedClient();
    const otherClientId = await seedClient();
    const otherOpenId = await seedInvoice({ clientId: otherClientId });
    const otherPaidId = await seedInvoice({
      clientId: otherClientId,
      status: "PAID",
    });

    for (const invoiceId of [otherOpenId, randomUUID(), "nope"]) {
      expect(await invoices.markPaid(clientId, invoiceId, TODAY)).toMatchObject(
        { error: "not-found", status: 404 },
      );
      expect(await invoices.voidInvoice(clientId, invoiceId)).toMatchObject({
        error: "not-found",
      });
    }
    expect(await invoices.revertPaid(clientId, otherPaidId)).toMatchObject({
      error: "not-found",
    });
    expect(await invoices.revertPaid(clientId, "nope")).toMatchObject({
      error: "not-found",
    });
    // Still Open: due in April, so shown Overdue.
    expect(
      (await invoices.getAdminInvoice(otherClientId, otherOpenId))?.status,
    ).toBe("OVERDUE");
  });
});

describe("Overdue and today", () => {
  it("shows an Invoice due on New York's today as Open, and one due yesterday as Overdue", async () => {
    const clientId = await seedClient();
    const dueTodayId = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: TODAY,
    });
    const dueYesterdayId = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: YESTERDAY,
    });

    const rows = await invoices.listInvoices(clientId);

    expect(invoices.getToday()).toBe(TODAY);
    expect(rows.find((row) => row.id === dueTodayId)?.status).toBe("OPEN");
    expect(rows.find((row) => row.id === dueYesterdayId)?.status).toBe(
      "OVERDUE",
    );
    expect((await invoices.getInvoice(clientId, dueYesterdayId))?.status).toBe(
      "OVERDUE",
    );
  });
});

describe("Client side", () => {
  it("lists the Client's Invoices without Void, newest issue date then number first", async () => {
    const clientId = await seedClient();
    const dueDate = "2026-10-31";
    const older = await seedInvoice({
      clientId,
      issueDate: "2026-09-01",
      dueDate,
    });
    const paid = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate,
      status: "PAID",
    });
    const sameDayLater = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate,
      lineItems: [{ amountCents: 1_000 }, { amountCents: 500 }],
    });
    await seedInvoice({
      clientId,
      issueDate: "2026-10-02",
      dueDate,
      status: "VOID",
    });

    const rows = await invoices.listInvoices(clientId);

    expect(rows.map((row) => row.id)).toEqual([sameDayLater, paid, older]);
    expect(rows[0]).toMatchObject({
      issueDate: "2026-10-01",
      dueDate,
      totalCents: 1_500,
    });
    expect(await invoices.listInvoices(clientId, { limit: 2 })).toHaveLength(2);
  });

  it("returns a detail with Line Items by position, and null for Void, another Client's, unknown and non-UUID ids", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id, name: "Website" });
    });
    const otherClientId = await seedClient();
    const invoiceId = await seedInvoice({
      clientId,
      projectId,
      memo: "Net 30",
      status: "PAID",
      paidAt: "2026-03-10",
      lineItems: [
        { description: "Design", amountCents: 2_000 },
        { description: "Credit", amountCents: -500 },
      ],
    });
    const voidId = await seedInvoice({ clientId, status: "VOID" });
    const otherId = await seedInvoice({ clientId: otherClientId });

    expect(await invoices.getInvoice(clientId, invoiceId)).toMatchObject({
      id: invoiceId,
      status: "PAID",
      totalCents: 1_500,
      memo: "Net 30",
      paidDate: "2026-03-10",
      project: { id: projectId, name: "Website" },
      lineItems: [
        { description: "Design", amountCents: 2_000 },
        { description: "Credit", amountCents: -500 },
      ],
    });
    expect(await invoices.getInvoice(clientId, voidId)).toBeNull();
    expect(await invoices.getInvoice(clientId, otherId)).toBeNull();
    expect(await invoices.getInvoice(clientId, randomUUID())).toBeNull();
    expect(await invoices.getInvoice(clientId, "nope")).toBeNull();
  });

  it("sums the open balance over Open and Overdue, and counts the Overdue ones", async () => {
    const clientId = await seedClient();
    await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: TODAY,
      lineItems: [{ amountCents: 10_000 }, { amountCents: -2_500 }],
    });
    await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: YESTERDAY,
      lineItems: [{ amountCents: 30_000 }],
    });
    await seedInvoice({ clientId, status: "PAID" });
    await seedInvoice({ clientId, status: "VOID" });

    expect(await invoices.getInvoiceSummary(clientId)).toEqual({
      openCount: 2,
      openBalanceCents: 37_500,
      overdueCount: 1,
    });
  });

  it("summarises a Client with no Invoices as zero", async () => {
    const clientId = await seedClient();

    expect(await invoices.getInvoiceSummary(clientId)).toEqual({
      openCount: 0,
      openBalanceCents: 0,
      overdueCount: 0,
    });
  });
});

describe("Admin side", () => {
  it("lists every status, Void included, for an archived Client too", async () => {
    const clientId = await seedClient();
    const voidId = await seedInvoice({
      clientId,
      issueDate: "2026-10-02",
      dueDate: TODAY,
      status: "VOID",
    });
    const overdueId = await seedInvoice({
      clientId,
      issueDate: "2026-10-01",
      dueDate: YESTERDAY,
    });
    await archiveClient(clientId);

    const rows = await invoices.listClientInvoices(clientId);

    expect(rows.map((row) => [row.id, row.status])).toEqual([
      [voidId, "VOID"],
      [overdueId, "OVERDUE"],
    ]);
  });

  it("reads a Void Invoice's detail, and null for another Client's", async () => {
    const clientId = await seedClient();
    const otherClientId = await seedClient();
    const voidId = await seedInvoice({ clientId, status: "VOID" });

    expect((await invoices.getAdminInvoice(clientId, voidId))?.status).toBe(
      "VOID",
    );
    expect(await invoices.getAdminInvoice(otherClientId, voidId)).toBeNull();
    expect(await invoices.getAdminInvoice(clientId, "nope")).toBeNull();
    expect(await invoices.listClientInvoices("nope")).toEqual([]);
  });

  it("lists active Clients with an Overdue Invoice, leaving out archived ones", async () => {
    const overdueClient = await seedClient();
    const dueTodayClient = await seedClient();
    const paidLateClient = await seedClient();
    const archivedClient = await seedClient();
    await seedInvoice({ clientId: overdueClient, dueDate: YESTERDAY });
    await seedInvoice({ clientId: overdueClient, dueDate: YESTERDAY });
    await seedInvoice({
      clientId: dueTodayClient,
      issueDate: "2026-10-01",
      dueDate: TODAY,
    });
    await seedInvoice({ clientId: paidLateClient, status: "PAID" });
    await seedInvoice({ clientId: archivedClient, dueDate: YESTERDAY });
    await archiveClient(archivedClient);

    const ids = await invoices.listOverdueClientIds();

    expect(ids.filter((id) => id === overdueClient)).toHaveLength(1);
    expect(ids).not.toContain(dueTodayClient);
    expect(ids).not.toContain(paidLateClient);
    expect(ids).not.toContain(archivedClient);
  });
});
