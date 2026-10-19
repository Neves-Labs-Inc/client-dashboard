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
import type { RequestRow } from "@/lib/requests/requests";
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

type Params = { clientId: string; projectId?: string; requestId?: string };

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
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    const ids = [clientA, clientB];
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
});
