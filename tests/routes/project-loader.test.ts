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
import { createDb, type Tx } from "@/lib/db/db";
import { db as appDb } from "@/lib/db/db.server";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import {
  headers as projectHeaders,
  loader as projectLoader,
  shouldRevalidate as projectShouldRevalidate,
} from "@/routes/client/project";
import {
  insertMilestone,
  insertProject,
  insertStatusMapping,
  insertStatusUpdate,
  insertTask,
} from "../support/board";
import { deleteClients, insertClients } from "../support/clients";

// The session store is the boundary; the read model runs against the test
// database as the app does, so Client scoping is the real RLS + filters.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: { getAccess: (request: Request) => getAccess(request) },
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
let otherProjectId = "";

function accessFor(id: string): Access {
  return {
    kind: "client",
    userId: "u1",
    email: "maya@acme.test",
    name: "Maya Chen",
    clientId: id,
    clientName: "Acme",
    role: "member",
  };
}

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

type LoaderArgs = Parameters<typeof projectLoader>[0];

function argsFor(id: string): LoaderArgs {
  const request = new Request(`${PORTAL_ORIGIN}/projects/${id}`);
  // The loader reads only the request and params.
  return { request, params: { projectId: id }, context: {} } as LoaderArgs;
}

// What the loader returned or threw: a redirect Response, or a data() result.
async function settle(id: string): Promise<{
  status: number;
  headers: Headers;
  data: unknown;
}> {
  let outcome: unknown;
  try {
    outcome = await projectLoader(argsFor(id));
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    outcome = thrown;
  }
  if (outcome instanceof Response) {
    return { status: outcome.status, headers: outcome.headers, data: null };
  }
  // data() returns a plain { data, init } object (a library return value).
  const result = outcome as { data: unknown; init?: ResponseInit | null };
  return {
    status: result.init?.status ?? 200,
    headers: new Headers(result.init?.headers),
    data: result.data,
  };
}

async function seedProject(tx: Tx, owner: string): Promise<string> {
  const id = await insertProject(tx, { clientId: owner, name: "Website" });
  await insertStatusMapping(tx, {
    clientId: owner,
    projectId: id,
    githubOptionId: `done-${id}`,
    clientStatus: "DONE",
  });
  await insertStatusUpdate(tx, {
    clientId: owner,
    projectId: id,
    health: "AT_RISK",
    body: "Latest",
    githubCreatedAt: new Date("2026-10-10T12:00:00Z"),
  });
  await insertStatusUpdate(tx, {
    clientId: owner,
    projectId: id,
    health: "ON_TRACK",
    body: "Earlier",
    githubCreatedAt: new Date("2026-10-01T12:00:00Z"),
  });
  const milestoneId = await insertMilestone(tx, {
    clientId: owner,
    projectId: id,
    title: "Launch",
    dueDate: "2026-11-14",
  });
  await insertTask(tx, {
    clientId: owner,
    projectId: id,
    milestoneId,
    title: "Checkout page",
    statusOptionId: `done-${id}`,
    completedAt: new Date("2026-10-05T12:00:00Z"),
  });
  return id;
}

beforeAll(async () => {
  await seedDb.withSystem(async (tx) => {
    await insertClients(tx, [clientId, otherClientId]);
    projectId = await seedProject(tx, clientId);
    otherProjectId = await seedProject(tx, otherClientId);
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    const ids = [clientId, otherClientId];
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
  answerAs(accessFor(clientId));
});

describe("the Project view loader", () => {
  it("gives the signed-in Client its Project's view", async () => {
    const { status, data } = await settle(projectId);

    expect(status).toBe(200);
    expect(data).toMatchObject({
      clientName: "Acme",
      project: {
        id: projectId,
        name: "Website",
        isPast: false,
        latest: { health: "AT_RISK", body: "Latest" },
        earlier: [{ health: "ON_TRACK", body: "Earlier" }],
        milestones: [
          {
            title: "Launch",
            dueDate: "2026-11-14",
            progress: { done: 1, total: 1, percent: 100 },
            tasks: {
              UP_NEXT: [],
              IN_PROGRESS: [],
              DONE: [{ title: "Checkout page" }],
            },
          },
        ],
        otherWork: null,
      },
    });
  });

  it("answers 404 for another Client's Project, keeping the session's cookie", async () => {
    const { status, headers, data } = await settle(otherProjectId);

    expect(status).toBe(NOT_FOUND);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    expect(JSON.stringify(data ?? null)).not.toContain("Website");
  });

  it("answers 404 for an unknown Project id", async () => {
    const { status } = await settle(randomUUID());

    expect(status).toBe(NOT_FOUND);
  });

  it("answers 404, not 500, for an id that isn't a UUID", async () => {
    const { status } = await settle("not-a-uuid");

    expect(status).toBe(NOT_FOUND);
  });

  it("sends the Admin away before reading anything", async () => {
    answerAs({ kind: "admin", email: "admin@test.local" });

    const { headers } = await settle(projectId);

    expect(headers.get("location")).toBe("/admin");
  });
});

describe("the Project view route", () => {
  it("stays still after a failed theme change", () => {
    type RevalidateArgs = Parameters<typeof projectShouldRevalidate>[0];
    const url = new URL(`/projects/${projectId}`, PORTAL_ORIGIN);
    const args = {
      currentUrl: url,
      nextUrl: url,
      formAction: "/theme",
      actionResult: { ok: false },
      defaultShouldRevalidate: true,
    } as RevalidateArgs;

    expect(projectShouldRevalidate(args)).toBe(false);
  });

  it("is no-store and keeps the session's cookie", () => {
    type HeadersArgs = Parameters<typeof projectHeaders>[0];
    const loaderHeaders = new Headers();
    loaderHeaders.append("set-cookie", RENEWED_COOKIE);

    const headers = new Headers(
      projectHeaders({
        loaderHeaders,
        parentHeaders: new Headers(),
      } as HeadersArgs),
    );

    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });
});
