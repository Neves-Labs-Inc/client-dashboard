import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
import { clients } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { getDefaultDueDate } from "@/lib/invoices/invoice-rules";
import { invoices } from "@/lib/invoices/invoices.server";
import { action as createAction } from "@/routes/admin/invoices";
import { insertProject } from "../support/board";
import { deleteClients, insertClients } from "../support/clients";
import { deleteInvoices } from "../support/invoices";

// The session store is the boundary. The global New invoice action runs
// the Invoices module against the test database, so the Client and Project
// checks are the real ones.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };

const env = getAppEnv();
const seedDb = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});

const clientId = randomUUID();
const otherClientId = randomUUID();
const archivedClientId = randomUUID();
let otherProjectId = "";

type ActionArgs = Parameters<typeof createAction>[0];
type Settled = { status: number; data: unknown };

function postNew(fields: Record<string, string>): ActionArgs {
  const today = invoices.getToday();
  const body = new FormData();
  const draft = {
    issueDate: today,
    dueDate: getDefaultDueDate(today),
    projectId: "",
    memo: "",
    description: "Workshop",
    amount: "100",
    ...fields,
  };
  for (const [name, value] of Object.entries(draft)) body.set(name, value);
  const request = new Request(`${PORTAL_ORIGIN}/admin/invoices`, {
    method: "POST",
    body,
    headers: { origin: PORTAL_ORIGIN },
  });
  return { request, params: {}, context: {} } as ActionArgs;
}

async function settle(args: ActionArgs): Promise<Settled> {
  // data() returns a plain { data, init } object (a library return value).
  const result = (await createAction(args)) as unknown as {
    data: unknown;
    init?: ResponseInit | null;
  };
  return { status: result.init?.status ?? 200, data: result.data };
}

beforeAll(async () => {
  await seedDb.withSystem(async (tx) => {
    await insertClients(tx, [clientId, otherClientId, archivedClientId]);
    otherProjectId = await insertProject(tx, {
      clientId: otherClientId,
      name: "Elsewhere",
    });
    await tx
      .update(clients)
      .set({ archivedAt: new Date() })
      .where(eq(clients.id, archivedClientId));
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    const ids = [clientId, otherClientId, archivedClientId];
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
  getAccess.mockReset();
  getAccess.mockResolvedValue({ access: ADMIN, headers: new Headers() });
});

describe("the global New invoice action, on the real Invoices module", () => {
  it("issues the Invoice to the posted Client", async () => {
    const outcome = await settle(postNew({ clientId }));

    expect(outcome).toMatchObject({
      status: 201,
      data: { kind: "created", number: expect.stringMatching(/^NL-/) },
    });
    expect(await invoices.listClientInvoices(clientId)).toHaveLength(1);
  });

  it("refuses another Client's Project with the Project field error", async () => {
    const outcome = await settle(
      postNew({ clientId, projectId: otherProjectId }),
    );

    expect(outcome).toMatchObject({
      status: 422,
      data: { kind: "invalid", fieldErrors: { projectId: expect.any(String) } },
    });
  });

  it("refuses an archived Client with 409", async () => {
    const outcome = await settle(postNew({ clientId: archivedClientId }));

    expect(outcome).toEqual({
      status: 409,
      data: { kind: "refused", error: "archived" },
    });
  });

  it("refuses an unknown Client with 404", async () => {
    const outcome = await settle(postNew({ clientId: randomUUID() }));

    expect(outcome).toEqual({
      status: 404,
      data: { kind: "refused", error: "not-found" },
    });
  });
});
