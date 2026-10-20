import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Access, AccessResult } from "@/lib/auth/auth";
import { createDb } from "@/lib/db/db";
import { db as appDb } from "@/lib/db/db.server";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { loader as invoiceLoader } from "@/routes/client/invoice";
import { loader as invoicesLoader } from "@/routes/client/invoices";
import { loader as layoutLoader } from "@/routes/client/layout";
import { insertProject } from "../support/board";
import { deleteClients, insertClients } from "../support/clients";
import { deleteInvoices, insertInvoice } from "../support/invoices";

// The session store is the boundary. The Client routes run the Invoices
// module against the test database as the app does, so Client scoping and
// the Void filter are the real app_tenant + RLS path.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const NOT_FOUND = 404;

const env = getAppEnv();
const seedDb = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});

const clientId = randomUUID();
const otherClientId = randomUUID();
let projectId = "";
// Newest issue date first; the Void one is never shown.
let shownIds: string[] = [];
let paidId = "";
let voidId = "";
let otherClientInvoiceId = "";

const MEMBER: Access = {
  kind: "client",
  userId: randomUUID(),
  email: "jo@acme.test",
  name: "Jo",
  clientId,
  clientName: "Acme",
  role: "member",
};

type ListArgs = Parameters<typeof invoicesLoader>[0];
type DetailArgs = Parameters<typeof invoiceLoader>[0];

function getList(): ListArgs {
  const request = new Request(
    `${PORTAL_ORIGIN}/invoices?clientId=${otherClientId}`,
  );
  return { request, params: {}, context: {} } as ListArgs;
}

function getDetail(invoiceId: string): DetailArgs {
  const request = new Request(`${PORTAL_ORIGIN}/invoices/${invoiceId}`);
  return { request, params: { invoiceId }, context: {} } as DetailArgs;
}

type Settled = { status: number; headers: Headers; data: unknown };

// What a loader returned or threw: a data() result.
async function settle(run: () => Promise<unknown>): Promise<Settled> {
  let outcome: unknown;
  try {
    outcome = await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    outcome = thrown;
  }
  // data() returns a plain { data, init } object (a library return value).
  const result = outcome as { data: unknown; init?: ResponseInit | null };
  return {
    status: result.init?.status ?? 200,
    headers: new Headers(result.init?.headers),
    data: result.data,
  };
}

beforeAll(async () => {
  await seedDb.withSystem(async (tx) => {
    await insertClients(tx, [clientId, otherClientId]);
    projectId = await insertProject(tx, { clientId, name: "Website" });
    const paid = await insertInvoice(tx, {
      clientId,
      issueDate: "2026-02-02",
      dueDate: "2026-03-04",
      status: "PAID",
      paidAt: "2026-03-01",
      memo: "Thanks!\nSee you soon.",
    });
    const overdue = await insertInvoice(tx, {
      clientId,
      projectId,
      issueDate: "2026-03-02",
      dueDate: "2026-04-01",
      lineItems: [
        { description: "Design sprint", amountCents: 400_000 },
        { description: "Credit", amountCents: -25_000 },
      ],
    });
    const voided = await insertInvoice(tx, {
      clientId,
      issueDate: "2026-04-02",
      dueDate: "2026-05-02",
      status: "VOID",
    });
    const other = await insertInvoice(tx, { clientId: otherClientId });
    shownIds = [overdue.id, paid.id];
    paidId = paid.id;
    voidId = voided.id;
    otherClientInvoiceId = other.id;
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    const ids = [clientId, otherClientId];
    await deleteInvoices(owner, ids);
    // Projects cascade to every other board table; clients don't cascade.
    await owner.query("delete from projects where client_id = any($1)", [ids]);
    await deleteClients(owner, ids);
  } finally {
    await owner.end();
    await seedDb.close();
    await appDb.close();
  }
});

beforeEach(() => {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockReset();
  getAccess.mockResolvedValue({ access: MEMBER, headers });
});

describe("the client Invoices routes, on the real tenant path", () => {
  it("lists the signed-in Client's Invoices newest first, never a Void one, whatever the URL says", async () => {
    const { data } = await settle(() => invoicesLoader(getList()));
    const page = data as {
      invoices: InvoiceRow[] | null;
      openBalanceCents: number | null;
    };

    expect(page.invoices?.map((invoice) => invoice.id)).toEqual(shownIds);
    // Its due date has passed (New York).
    expect(page.invoices?.map((invoice) => invoice.status)).toEqual([
      "OVERDUE",
      "PAID",
    ]);
    expect(page.openBalanceCents).toBe(375_000);
  });

  it("counts the Client's open Invoices, Overdue included, in the nav", async () => {
    const request = new Request(`${PORTAL_ORIGIN}/invoices`);
    const { data } = await settle(() =>
      layoutLoader({ request, params: {}, context: {} } as Parameters<
        typeof layoutLoader
      >[0]),
    );

    expect(data).toMatchObject({ openInvoiceCount: 1 });
  });

  it("shows an Invoice's facts, Project, Line Items and total", async () => {
    const [overdueId] = shownIds;
    const { data } = await settle(() => invoiceLoader(getDetail(overdueId)));

    expect(data).toMatchObject({
      clientName: "Acme",
      detail: {
        id: overdueId,
        issueDate: "2026-03-02",
        dueDate: "2026-04-01",
        status: "OVERDUE",
        paidDate: null,
        memo: null,
        project: { id: projectId, name: "Website" },
        totalCents: 375_000,
        lineItems: [
          { description: "Design sprint", amountCents: 400_000 },
          { description: "Credit", amountCents: -25_000 },
        ],
      },
    });
  });

  it("shows a Paid Invoice's paid date and memo", async () => {
    const { data } = await settle(() => invoiceLoader(getDetail(paidId)));

    expect(data).toMatchObject({
      detail: {
        status: "PAID",
        paidDate: "2026-03-01",
        memo: "Thanks!\nSee you soon.",
        project: null,
      },
    });
  });

  it.each([
    ["a Void Invoice", () => voidId],
    ["another Client's Invoice", () => otherClientInvoiceId],
    ["an unknown id", () => randomUUID()],
    ["an id that isn't a UUID", () => "not-a-uuid"],
  ])("answers 404 for %s, keeping the session's cookie", async (_, getId) => {
    const { status, headers, data } = await settle(() =>
      invoiceLoader(getDetail(getId())),
    );

    expect(status).toBe(NOT_FOUND);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    expect(data).toBeNull();
  });
});
