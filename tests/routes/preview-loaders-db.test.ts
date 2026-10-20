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
import type { AccessResult, Auth, Team } from "@/lib/auth/auth";
import type {
  ProjectSummary,
  ProjectView,
} from "@/lib/client-projects/client-projects";
import { createDb, type Tx } from "@/lib/db/db";
import { db as appDb } from "@/lib/db/db.server";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import type { InvoiceRow, InvoiceSummary } from "@/lib/invoices/invoices";
import type { RequestRow } from "@/lib/requests/requests";
import { loader as invoiceLoader } from "@/routes/preview/invoice";
import { loader as invoicesLoader } from "@/routes/preview/invoices";
import { loader as layoutLoader } from "@/routes/preview/layout";
import { loader as overviewLoader } from "@/routes/preview/overview";
import { loader as projectLoader } from "@/routes/preview/project";
import { loader as requestLoader } from "@/routes/preview/request";
import { loader as requestsLoader } from "@/routes/preview/requests";
import { loader as projectsLoader } from "@/routes/preview/projects";
import {
  insertMilestone,
  insertProject,
  insertStatusMapping,
  insertTask,
} from "../support/board";
import { deleteClients, insertClients } from "../support/clients";
import { deleteInvoices, insertInvoice } from "../support/invoices";
import { deleteRequestsAndUsers, insertRequest } from "../support/requests";

// The session store and Better Auth's Client lookup are the boundary; the
// read models run against the test database as the app does, so what the
// preview shows is the real app_tenant + RLS path, with no app.user_id.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
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

const clientA = randomUUID();
const clientB = randomUUID();
const submitterIds: string[] = [];
let projectA = "";
let projectB = "";
let requestA = "";
let requestB = "";
// Client A's, newest issue date first; the Void one is never shown.
let invoiceIdsA: string[] = [];
let voidInvoiceA = "";
let invoiceB = "";

function teamFor(clientId: string): Team {
  return {
    clientId,
    name: clientId === clientA ? "Acme" : "Beta",
    archivedAt: null,
    members: [],
    pendingInvitations: [],
    canInviteFirstOwner: true,
  };
}

type Params = {
  clientId: string;
  projectId?: string;
  requestId?: string;
  invoiceId?: string;
};

function argsFor<Args>(params: Params): Args {
  const request = new Request(
    `${PORTAL_ORIGIN}/admin/clients/${params.clientId}/preview`,
  );
  // Loaders read only the request and params.
  return { request, params, context: {} } as Args;
}

// What a loader returned or threw: a data() result's status and data.
async function settle(
  run: () => Promise<unknown>,
): Promise<{ status: number; data: unknown }> {
  let outcome: unknown;
  try {
    outcome = await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    outcome = thrown;
  }
  // data() returns a plain { data, init } object (a library return value).
  const result = outcome as { data: unknown; init?: ResponseInit | null };
  return { status: result.init?.status ?? 200, data: result.data };
}

// One Project with a visible Task and a soft-hidden one, and one Request.
async function seedClient(
  tx: Tx,
  clientId: string,
  label: string,
): Promise<{ projectId: string; requestId: string }> {
  const projectId = await insertProject(tx, {
    clientId,
    name: `${label} website`,
  });
  await insertStatusMapping(tx, {
    clientId,
    projectId,
    githubOptionId: `doing-${projectId}`,
    clientStatus: "IN_PROGRESS",
  });
  const milestoneId = await insertMilestone(tx, {
    clientId,
    projectId,
    title: `${label} launch`,
  });
  await insertTask(tx, {
    clientId,
    projectId,
    milestoneId,
    title: `${label} visible task`,
    statusOptionId: `doing-${projectId}`,
  });
  await insertTask(tx, {
    clientId,
    projectId,
    milestoneId,
    title: `${label} hidden task`,
    statusOptionId: `doing-${projectId}`,
    hiddenAt: new Date(),
  });
  const request = await insertRequest(tx, {
    clientId,
    title: `${label} request`,
  });
  submitterIds.push(request.submitterId);
  return { projectId, requestId: request.id };
}

beforeAll(async () => {
  await seedDb.withSystem(async (tx) => {
    await insertClients(tx, [clientA, clientB]);
    ({ projectId: projectA, requestId: requestA } = await seedClient(
      tx,
      clientA,
      "Acme",
    ));
    ({ projectId: projectB, requestId: requestB } = await seedClient(
      tx,
      clientB,
      "Beta",
    ));
    const paid = await insertInvoice(tx, {
      clientId: clientA,
      issueDate: "2026-02-02",
      dueDate: "2026-03-04",
      status: "PAID",
    });
    const open = await insertInvoice(tx, {
      clientId: clientA,
      issueDate: "2026-03-02",
      dueDate: "2026-04-01",
    });
    const voided = await insertInvoice(tx, {
      clientId: clientA,
      issueDate: "2026-04-02",
      dueDate: "2026-05-02",
      status: "VOID",
    });
    invoiceIdsA = [open.id, paid.id];
    voidInvoiceA = voided.id;
    invoiceB = (await insertInvoice(tx, { clientId: clientB })).id;
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    const ids = [clientA, clientB];
    await deleteInvoices(owner, ids);
    await deleteRequestsAndUsers(owner, {
      clientIds: ids,
      userIds: submitterIds,
    });
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
  getAccess.mockReset();
  getAccess.mockResolvedValue({
    access: { kind: "admin", email: "admin@test.local" },
    headers: new Headers(),
  });
  getTeam.mockReset();
  getTeam.mockImplementation(async (clientId) => teamFor(clientId));
});

describe("the preview, on the real tenant path", () => {
  it("never shows a soft-hidden Task in the Client's Project view", async () => {
    const { data } = await settle(() =>
      projectLoader(argsFor({ clientId: clientA, projectId: projectA })),
    );
    const { project } = data as { project: ProjectView };
    const titles = JSON.stringify(project);

    expect(project.name).toBe("Acme website");
    expect(titles).toContain("Acme visible task");
    expect(titles).not.toContain("hidden task");
    // GitHub option ids and names never reach the Client.
    expect(titles).not.toContain("doing-");
    expect(titles).not.toContain("In review");
  });

  it("shows only the Client's Projects and Requests on its Overview", async () => {
    const { data } = await settle(() =>
      overviewLoader(argsFor({ clientId: clientA })),
    );
    const page = data as {
      projects: Promise<ProjectSummary[] | null>;
      requests: Promise<RequestRow[] | null>;
    };
    const projects = await page.projects;
    const requests = await page.requests;

    expect(projects?.map((project) => project.name)).toEqual(["Acme website"]);
    expect(requests?.map((request) => request.title)).toEqual(["Acme request"]);
  });

  it("shows only the Client's Invoices and summary on its Overview, never a Void one", async () => {
    const { data } = await settle(() =>
      overviewLoader(argsFor({ clientId: clientA })),
    );
    const page = data as {
      invoices: Promise<InvoiceRow[] | null>;
      invoiceSummary: Promise<InvoiceSummary | null>;
    };

    expect((await page.invoices)?.map((invoice) => invoice.id)).toEqual(
      invoiceIdsA,
    );
    expect(await page.invoiceSummary).toEqual({
      openCount: 1,
      openBalanceCents: 125_000,
      overdueCount: 1,
    });
  });

  it("shows only the Client's Projects on its Projects list", async () => {
    const { data } = await settle(() =>
      projectsLoader(argsFor({ clientId: clientA })),
    );
    const projects = await (data as { projects: Promise<ProjectSummary[]> })
      .projects;

    expect(projects.map((project) => project.id)).toEqual([projectA]);
  });

  it("answers 404 for another Client's Project", async () => {
    const { status } = await settle(() =>
      projectLoader(argsFor({ clientId: clientA, projectId: projectB })),
    );

    expect(status).toBe(NOT_FOUND);
  });

  it("counts the Client's own Projects and New Requests in the nav", async () => {
    const { data } = await settle(() =>
      layoutLoader(argsFor({ clientId: clientA })),
    );

    expect(data).toMatchObject({
      clientName: "Acme",
      activeProjectCount: 1,
      newRequestCount: 1,
      // The Open one only: Paid and Void aren't open.
      openInvoiceCount: 1,
    });
  });

  it("lists only the Client's Requests", async () => {
    const { data } = await settle(() =>
      requestsLoader(argsFor({ clientId: clientA })),
    );
    const { requests } = data as { requests: RequestRow[] | null };

    expect(requests?.map((request) => request.id)).toEqual([requestA]);
  });

  it("shows the Client's Request, never as an editable one", async () => {
    const { data } = await settle(() =>
      requestLoader(argsFor({ clientId: clientA, requestId: requestA })),
    );

    expect(data).toMatchObject({
      detail: { id: requestA, title: "Acme request", canChange: false },
    });
  });

  it("answers 404 for another Client's Request", async () => {
    const { status } = await settle(() =>
      requestLoader(argsFor({ clientId: clientA, requestId: requestB })),
    );

    expect(status).toBe(NOT_FOUND);
  });

  it("lists only the Client's Invoices, newest first, never a Void one", async () => {
    const { data } = await settle(() =>
      invoicesLoader(argsFor({ clientId: clientA })),
    );
    const page = data as {
      invoices: InvoiceRow[] | null;
      openBalanceCents: number | null;
    };

    expect(page.invoices?.map((invoice) => invoice.id)).toEqual(invoiceIdsA);
    // Its due date has passed.
    expect(page.invoices?.[0].status).toBe("OVERDUE");
    expect(page.openBalanceCents).toBe(125_000);
  });

  it("shows the Client's Invoice", async () => {
    const [openId] = invoiceIdsA;
    const { data } = await settle(() =>
      invoiceLoader(argsFor({ clientId: clientA, invoiceId: openId })),
    );

    expect(data).toMatchObject({
      clientName: "Acme",
      detail: { id: openId, totalCents: 125_000 },
    });
  });

  it.each([
    ["a Void Invoice", () => voidInvoiceA],
    ["another Client's Invoice", () => invoiceB],
  ])("answers 404 for %s", async (_, getId) => {
    const { status } = await settle(() =>
      invoiceLoader(argsFor({ clientId: clientA, invoiceId: getId() })),
    );

    expect(status).toBe(NOT_FOUND);
  });
});
