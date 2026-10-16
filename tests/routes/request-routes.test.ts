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
import type {
  Access,
  AccessResult,
  Auth,
  ClientAccess,
  Team,
} from "@/lib/auth/auth";
import { createDb } from "@/lib/db/db";
import { db as appDb } from "@/lib/db/db.server";
import { requests as requestsTable } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import {
  runRequestClientAction,
  type RequestOutcome,
} from "@/lib/request-outcome";
import type {
  AdminRequestDetail,
  AdminRequestRow,
  Requests,
} from "@/lib/requests/requests";
import {
  action as clientRequestAction,
  loader as clientRequestLoader,
  shouldRevalidate as clientRequestShouldRevalidate,
} from "@/routes/admin/client-request";
import { loader as clientRequestsLoader } from "@/routes/admin/client-requests";
import {
  action as inboxRequestAction,
  loader as inboxRequestLoader,
} from "@/routes/admin/request";
import { loader as inboxLoader } from "@/routes/admin/requests";
import {
  action as detailAction,
  loader as detailLoader,
  shouldRevalidate as detailShouldRevalidate,
} from "@/routes/client/request";
import {
  action as listAction,
  headers as listHeaders,
  loader as listLoader,
  shouldRevalidate as listShouldRevalidate,
} from "@/routes/client/requests";
import { insertProject } from "../support/board";
import { deleteClients, insertClients } from "../support/clients";
import {
  deleteRequestsAndUsers,
  insertRequest,
  insertUser,
} from "../support/requests";

// The session store is the boundary. The Client routes run the Requests
// module against the test database as the app does, so Client scoping is the
// real RLS + filters; the Admin routes stub the module's Admin reads and
// triage, which the module's own tests cover.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();
const listInbox = vi.fn<Requests["listInbox"]>();
const listClientRequests = vi.fn<Requests["listClientRequests"]>();
const getAdminRequest = vi.fn<Requests["getAdminRequest"]>();
const listTaskOptions = vi.fn<Requests["listTaskOptions"]>();
const triageRequest = vi.fn<Requests["triageRequest"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
  },
}));

vi.mock("@/lib/requests/requests.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/requests/requests.server")>();
  return {
    requests: {
      ...actual.requests,
      listInbox: (filter: "new" | "all") => listInbox(filter),
      listClientRequests: (clientId: string) => listClientRequests(clientId),
      getAdminRequest: (requestId: string, clientId?: string) =>
        getAdminRequest(requestId, clientId),
      listTaskOptions: (clientId: string, projectId: string | null) =>
        listTaskOptions(clientId, projectId),
      triageRequest: (...args: Parameters<Requests["triageRequest"]>) =>
        triageRequest(...args),
    },
  };
});

const PORTAL_ORIGIN = "http://localhost:5173";
const FOREIGN_ORIGIN = "http://www.localhost:5173";
const NOT_FOUND = 404;

const env = getAppEnv();
const seedDb = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});

const clientId = randomUUID();
const otherClientId = randomUUID();
const ownerId = randomUUID();
const memberId = randomUUID();
const outsiderId = randomUUID();
let projectId = "";
let otherProjectId = "";
let otherClientRequestId = "";

const ADMIN: Access = { kind: "admin", email: "admin@test.local" };

function accessFor(
  userId: string,
  role: ClientAccess["role"],
  id: string = clientId,
): ClientAccess {
  return {
    kind: "client",
    userId,
    email: `${userId}@test.local`,
    name: "Test User",
    clientId: id,
    clientName: "Acme",
    role,
  };
}

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

type ListArgs = Parameters<typeof listLoader>[0];
type DetailArgs = Parameters<typeof detailLoader>[0];

function getList(): ListArgs {
  const request = new Request(`${PORTAL_ORIGIN}/requests`);
  return { request, params: {}, context: {} } as ListArgs;
}

function getDetail(requestId: string): DetailArgs {
  const request = new Request(`${PORTAL_ORIGIN}/requests/${requestId}`);
  return { request, params: { requestId }, context: {} } as DetailArgs;
}

function toForm(fields: Record<string, string>): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
}

function postList(
  fields: Record<string, string>,
  origin: string = PORTAL_ORIGIN,
): ListArgs {
  const request = new Request(`${PORTAL_ORIGIN}/requests`, {
    method: "POST",
    body: toForm(fields),
    headers: { origin },
  });
  return { request, params: {}, context: {} } as ListArgs;
}

function postDetail(
  requestId: string,
  fields: Record<string, string>,
  origin: string = PORTAL_ORIGIN,
): DetailArgs {
  const request = new Request(`${PORTAL_ORIGIN}/requests/${requestId}`, {
    method: "POST",
    body: toForm(fields),
    headers: { origin },
  });
  return { request, params: { requestId }, context: {} } as DetailArgs;
}

type Settled = { status: number; headers: Headers; data: unknown };

// What a loader or action returned or threw: a redirect Response, or a
// data() result.
async function settle(run: () => Promise<unknown>): Promise<Settled> {
  let outcome: unknown;
  try {
    outcome = await run();
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

const VALID_DRAFT = {
  kind: "FEATURE",
  title: "Export tasks to CSV",
  description: "So we can share them.",
  projectId: "",
};

async function seedOwnRequest(
  submitterId: string,
  status: "NEW" | "ACCEPTED" = "NEW",
): Promise<string> {
  const { id } = await seedDb.withSystem((tx) =>
    insertRequest(tx, { clientId, submitterId, status }),
  );
  return id;
}

async function readStatus(requestId: string): Promise<string | undefined> {
  const [row] = await seedDb.withSystem((tx) =>
    tx
      .select({ status: requestsTable.status })
      .from(requestsTable)
      .where(eq(requestsTable.id, requestId)),
  );
  return row?.status;
}

beforeAll(async () => {
  await seedDb.withSystem(async (tx) => {
    await insertClients(tx, [clientId, otherClientId]);
    for (const id of [ownerId, memberId, outsiderId]) await insertUser(tx, id);
    projectId = await insertProject(tx, { clientId, name: "Mobile app" });
    otherProjectId = await insertProject(tx, {
      clientId: otherClientId,
      name: "Elsewhere",
    });
    otherClientRequestId = (
      await insertRequest(tx, {
        clientId: otherClientId,
        submitterId: outsiderId,
        title: "Another Client's secret",
      })
    ).id;
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    const ids = [clientId, otherClientId];
    await deleteRequestsAndUsers(owner, {
      clientIds: ids,
      userIds: [ownerId, memberId, outsiderId],
    });
    await owner.query("delete from projects where client_id = any($1)", [ids]);
    await deleteClients(owner, ids);
  } finally {
    await owner.end();
    await seedDb.close();
    await appDb.close();
  }
});

const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const OTHER_CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcf";
const REQUEST_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const TASK_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abd0";
const ANONYMOUS: Access = { kind: "anonymous" };
const CLIENT_USER: Access = {
  kind: "client",
  userId: "user-1",
  email: "owner@acme.test",
  name: "Olivia",
  clientId: CLIENT_ID,
  clientName: "Acme",
  role: "owner",
};
const TEAM: Team = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
  members: [],
  pendingInvitations: [],
  canInviteFirstOwner: false,
};
const ROW: AdminRequestRow = {
  id: REQUEST_ID,
  kind: "BUG",
  title: "Receipt PDF is missing the store address",
  status: "NEW",
  submitterName: "Maya Chen",
  createdAt: new Date("2026-10-07"),
  clientId: CLIENT_ID,
  clientName: "Acme",
};
const DETAIL: AdminRequestDetail = {
  ...ROW,
  description: "What happened",
  statusChangedAt: new Date("2026-10-07"),
  responseNote: null,
  project: null,
  clientArchived: false,
  submitterEmail: "maya@acme.test",
  taskId: null,
  taskTitle: null,
  taskTracked: false,
};
const TASK_GROUPS = [
  {
    projectId: "p1",
    label: "Receipts app",
    options: [{ id: TASK_ID, label: "Fix receipt PDF" }],
  },
];

function getArgs<Args>(path: string, params: Record<string, string>): Args {
  // Loaders read only the request and params.
  return {
    request: new Request(`${PORTAL_ORIGIN}${path}`),
    params,
    context: {},
  } as Args;
}

function postArgs<Args>(
  path: string,
  fields: Record<string, string>,
  params: Record<string, string>,
  origin = PORTAL_ORIGIN,
): Args {
  const request = new Request(`${PORTAL_ORIGIN}${path}`, {
    method: "POST",
    body: toForm(fields),
    headers: { origin },
  });
  return { request, params, context: {} } as Args;
}

const INBOX_DETAIL_PATH = `/admin/requests/${REQUEST_ID}`;
const CLIENT_DETAIL_PATH = `/admin/clients/${CLIENT_ID}/requests/${REQUEST_ID}`;
const INBOX_PARAMS = { requestId: REQUEST_ID };
const CLIENT_PARAMS = { clientId: CLIENT_ID, requestId: REQUEST_ID };
const TRIAGE_FIELDS = {
  status: "ACCEPTED",
  responseNote: "On it",
  taskId: TASK_ID,
};

function inboxTriage(
  fields: Record<string, string> = TRIAGE_FIELDS,
  origin = PORTAL_ORIGIN,
): Parameters<typeof inboxRequestAction>[0] {
  return postArgs(INBOX_DETAIL_PATH, fields, INBOX_PARAMS, origin);
}

function clientTriage(
  fields: Record<string, string> = TRIAGE_FIELDS,
  origin = PORTAL_ORIGIN,
): Parameters<typeof clientRequestAction>[0] {
  return postArgs(CLIENT_DETAIL_PATH, fields, CLIENT_PARAMS, origin);
}

// What a loader or action returned or threw, unwrapped.
async function catchOutcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    return thrown;
  }
}

describe("the Client Requests routes", () => {
  beforeEach(() => {
    getAccess.mockReset();
    answerAs(accessFor(memberId, "member"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("the Requests page", () => {
    it("lists only the signed-in Client's Requests, with its project options", async () => {
      const id = await seedOwnRequest(ownerId);

      const {
        status,
        headers,
        data: page,
      } = await settle(() => listLoader(getList()));

      expect(status).toBe(200);
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
      expect(page).toMatchObject({
        clientName: "Acme",
        projectOptions: [{ id: projectId, name: "Mobile app", isPast: false }],
      });
      const listed = (page as { requests: { id: string }[] }).requests;
      expect(listed.map((row) => row.id)).toContain(id);
      expect(JSON.stringify(page)).not.toContain("Another Client's secret");
    });

    it.each([
      ["an Owner", ownerId, "owner"],
      ["a Member", memberId, "member"],
    ] as const)(
      "lets %s submit a Request, which tops the list",
      async (_, userId, role) => {
        answerAs(accessFor(userId, role));

        const { status, data: outcome } = await settle(() =>
          listAction(postList({ ...VALID_DRAFT, projectId })),
        );

        expect(status).toBe(201);
        const { requestId } = outcome as {
          kind: "submitted";
          requestId: string;
        };
        expect(outcome).toEqual({ kind: "submitted", requestId });
        const { data: page } = await settle(() => listLoader(getList()));
        const [newest] = (page as { requests: { id: string }[] }).requests;
        expect(newest.id).toBe(requestId);
      },
    );

    it.each([
      ["an empty title", { title: "  " }, { title: "Enter a title." }],
      [
        "a title over 200 characters",
        { title: "x".repeat(201) },
        { title: "Keep the title under 200 characters." },
      ],
      [
        "an empty description",
        { description: "" },
        { description: "Describe the bug or the feature." },
      ],
      [
        "a description over 5,000 characters",
        { description: "x".repeat(5001) },
        { description: "Keep the description under 5,000 characters." },
      ],
    ])("refuses %s with its field copy", async (_, change, fieldErrors) => {
      const { status, data: outcome } = await settle(() =>
        listAction(postList({ ...VALID_DRAFT, ...change })),
      );

      expect(status).toBe(422);
      expect(outcome).toEqual({ kind: "invalid", fieldErrors });
    });

    it("refuses a forged projectId of another Client with the field error", async () => {
      const { status, data: outcome } = await settle(() =>
        listAction(postList({ ...VALID_DRAFT, projectId: otherProjectId })),
      );

      expect(status).toBe(422);
      expect(outcome).toEqual({
        kind: "invalid",
        fieldErrors: { projectId: "Choose a project from the list." },
      });
    });

    it("refuses a cross-origin POST with 403 before the body is read", async () => {
      const args = postList(VALID_DRAFT, FOREIGN_ORIGIN);

      const { status } = await settle(() => listAction(args));

      expect(status).toBe(403);
      expect(args.request.bodyUsed).toBe(false);
    });

    it("sends the Admin away from the page and its action", async () => {
      answerAs(ADMIN);

      const loaded = await settle(() => listLoader(getList()));
      const posted = await settle(() => listAction(postList(VALID_DRAFT)));

      expect(loaded.headers.get("location")).toBe("/admin");
      expect(posted.headers.get("location")).toBe("/admin");
    });

    it("is no-store and keeps the session's cookie", () => {
      type HeadersArgs = Parameters<typeof listHeaders>[0];
      const loaderHeaders = new Headers();
      loaderHeaders.append("set-cookie", RENEWED_COOKIE);

      const headers = new Headers(
        listHeaders({
          loaderHeaders,
          parentHeaders: new Headers(),
        } as HeadersArgs),
      );

      expect(headers.get("cache-control")).toBe("private, no-store");
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });

    it("doesn't reload when the drawer only opens or closes", () => {
      type RevalidateArgs = Parameters<typeof listShouldRevalidate>[0];
      const base = {
        defaultShouldRevalidate: true,
        currentUrl: new URL("/requests", PORTAL_ORIGIN),
      };

      const opening = {
        ...base,
        nextUrl: new URL("/requests?new=request", PORTAL_ORIGIN),
      } as RevalidateArgs;
      const filtering = {
        ...base,
        nextUrl: new URL("/requests?page=2", PORTAL_ORIGIN),
      } as RevalidateArgs;

      expect(listShouldRevalidate(opening)).toBe(false);
      expect(listShouldRevalidate(filtering)).toBe(true);
    });
  });

  describe("the Request detail loader", () => {
    it("gives the submitter their New Request, which they may change", async () => {
      const id = await seedOwnRequest(memberId);

      const { status, data: page } = await settle(() =>
        detailLoader(getDetail(id)),
      );

      expect(status).toBe(200);
      expect(page).toMatchObject({
        clientName: "Acme",
        detail: { id, status: "NEW", canChange: true },
        projectOptions: [{ id: projectId }],
      });
    });

    it("shows another Client User the Request without the controls", async () => {
      const id = await seedOwnRequest(ownerId);

      const { data: page } = await settle(() => detailLoader(getDetail(id)));

      expect(page).toMatchObject({
        detail: { id, canChange: false },
        projectOptions: [],
      });
    });

    it.each([
      ["another Client's Request", () => otherClientRequestId],
      ["an unknown id", () => randomUUID()],
      ["an id that isn't a UUID", () => "not-a-uuid"],
    ])("answers 404 for %s, keeping the session's cookie", async (_, getId) => {
      const {
        status,
        headers,
        data: page,
      } = await settle(() => detailLoader(getDetail(getId())));

      expect(status).toBe(NOT_FOUND);
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
      expect(JSON.stringify(page ?? null)).not.toContain("secret");
    });

    it("sends the Admin away before reading anything", async () => {
      answerAs(ADMIN);

      const { headers } = await settle(() =>
        detailLoader(getDetail(otherClientRequestId)),
      );

      expect(headers.get("location")).toBe("/admin");
    });

    it("doesn't reload when the edit drawer only opens or closes", () => {
      type RevalidateArgs = Parameters<typeof detailShouldRevalidate>[0];
      const args = {
        defaultShouldRevalidate: true,
        currentUrl: new URL("/requests/abc?edit=1", PORTAL_ORIGIN),
        nextUrl: new URL("/requests/abc", PORTAL_ORIGIN),
      } as RevalidateArgs;

      expect(detailShouldRevalidate(args)).toBe(false);
    });
  });

  describe("the Request detail actions", () => {
    const edit = { intent: "edit", ...VALID_DRAFT, title: "Edited title" };
    const withdraw = { intent: "withdraw" };

    it("lets the submitter edit their New Request", async () => {
      const id = await seedOwnRequest(memberId);

      const { status, data: outcome } = await settle(() =>
        detailAction(postDetail(id, edit)),
      );
      const { data: page } = await settle(() => detailLoader(getDetail(id)));

      expect(status).toBe(200);
      expect(outcome).toEqual({ kind: "updated", requestId: id });
      expect(page).toMatchObject({ detail: { title: "Edited title" } });
    });

    it("answers an edit's invalid draft with its field copy", async () => {
      const id = await seedOwnRequest(memberId);

      const { status, data: outcome } = await settle(() =>
        detailAction(postDetail(id, { ...edit, title: "" })),
      );

      expect(status).toBe(422);
      expect(outcome).toEqual({
        kind: "invalid",
        fieldErrors: { title: "Enter a title." },
      });
    });

    it("lets the submitter withdraw their New Request", async () => {
      const id = await seedOwnRequest(memberId);

      const { status, data: outcome } = await settle(() =>
        detailAction(postDetail(id, withdraw)),
      );

      expect(status).toBe(200);
      expect(outcome).toEqual({ kind: "withdrawn" });
      expect(await readStatus(id)).toBe("WITHDRAWN");
    });

    it.each([
      ["an edit", edit],
      ["a withdraw", withdraw],
    ])(
      "answers %s of a Request that left New as not-new",
      async (_, fields) => {
        const id = await seedOwnRequest(memberId, "ACCEPTED");

        const { status, data: outcome } = await settle(() =>
          detailAction(postDetail(id, fields)),
        );

        expect(status).toBe(409);
        expect(outcome).toEqual({ kind: "not-new" });
        expect(await readStatus(id)).toBe("ACCEPTED");
      },
    );

    it.each([
      ["an edit", edit],
      ["a withdraw", withdraw],
    ])("answers 404 to %s forged by another Client User", async (_, fields) => {
      const id = await seedOwnRequest(ownerId);

      const { status } = await settle(() =>
        detailAction(postDetail(id, fields)),
      );

      expect(status).toBe(NOT_FOUND);
      expect(await readStatus(id)).toBe("NEW");
    });

    it("answers 404 to a change of another Client's Request", async () => {
      const { status } = await settle(() =>
        detailAction(postDetail(otherClientRequestId, withdraw)),
      );

      expect(status).toBe(NOT_FOUND);
      expect(await readStatus(otherClientRequestId)).toBe("NEW");
    });

    it("answers an unknown intent with 400", async () => {
      const id = await seedOwnRequest(memberId);

      const { status, data: outcome } = await settle(() =>
        detailAction(postDetail(id, { intent: "delete" })),
      );

      expect(status).toBe(400);
      expect(outcome).toEqual({ kind: "failed" });
    });

    it("refuses a cross-origin POST with 403 before the body is read", async () => {
      const id = await seedOwnRequest(memberId);

      for (const fields of [edit, withdraw]) {
        const args = postDetail(id, fields, FOREIGN_ORIGIN);
        const { status } = await settle(() => detailAction(args));
        expect(status).toBe(403);
        expect(args.request.bodyUsed).toBe(false);
      }
      expect(await readStatus(id)).toBe("NEW");
    });

    it("sends the Admin away from the actions", async () => {
      const id = await seedOwnRequest(memberId);
      answerAs(ADMIN);

      const { headers } = await settle(() =>
        detailAction(postDetail(id, withdraw)),
      );

      expect(headers.get("location")).toBe("/admin");
      expect(await readStatus(id)).toBe("NEW");
    });
  });

  describe("the Requests clientAction", () => {
    it("passes a success through as plain data", async () => {
      const outcome: RequestOutcome = { kind: "withdrawn" };

      expect(await runRequestClientAction(async () => outcome)).toBe(outcome);
    });

    it("keeps a refusal's 4xx status, so nothing revalidates on it", async () => {
      const result = await runRequestClientAction(async () => ({
        kind: "not-new" as const,
      }));

      expect(result).toMatchObject({
        data: { kind: "not-new" },
        init: { status: 409 },
      });
    });

    it("turns a network failure into the failed outcome with a 5xx", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await runRequestClientAction(() =>
        Promise.reject(new TypeError("Failed to fetch")),
      );

      expect(result).toMatchObject({
        data: { kind: "failed" },
        init: { status: 503 },
      });
    });

    it("lets a redirect through", async () => {
      const redirect = new Response(null, {
        status: 302,
        headers: { location: "/sign-in" },
      });

      const thrown = await runRequestClientAction(() =>
        Promise.reject(redirect),
      ).catch((error: unknown) => error);

      expect(thrown).toBe(redirect);
    });
  });
});

describe("the Admin Requests routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAccess.mockReset();
    getTeam.mockReset();
    getTeam.mockResolvedValue(TEAM);
    listInbox.mockReset();
    listInbox.mockResolvedValue([ROW]);
    listClientRequests.mockReset();
    listClientRequests.mockResolvedValue([ROW]);
    getAdminRequest.mockReset();
    getAdminRequest.mockResolvedValue(DETAIL);
    listTaskOptions.mockReset();
    listTaskOptions.mockResolvedValue(TASK_GROUPS);
    triageRequest.mockReset();
    triageRequest.mockResolvedValue({ value: null, error: null, status: 200 });
  });

  describe("the Requests routes' Admin guard", () => {
    const guarded = {
      "inbox loader": () => inboxLoader(getArgs("/admin/requests", {})),
      "inbox detail loader": () =>
        inboxRequestLoader(getArgs(INBOX_DETAIL_PATH, INBOX_PARAMS)),
      "Client tab loader": () =>
        clientRequestsLoader(
          getArgs(`/admin/clients/${CLIENT_ID}/requests`, {
            clientId: CLIENT_ID,
          }),
        ),
      "Client tab detail loader": () =>
        clientRequestLoader(getArgs(CLIENT_DETAIL_PATH, CLIENT_PARAMS)),
      "inbox triage action": () => inboxRequestAction(inboxTriage()),
      "Client tab triage action": () => clientRequestAction(clientTriage()),
    };

    for (const [access, home] of [
      [CLIENT_USER, "/overview"],
      [ANONYMOUS, "/sign-in"],
    ] as const) {
      for (const [use, run] of Object.entries(guarded)) {
        it(`sends a ${access.kind} visitor from the ${use} to ${home}`, async () => {
          answerAs(access);

          const outcome = await catchOutcome(run);

          expect(outcome).toBeInstanceOf(Response);
          expect((outcome as Response).headers.get("location")).toBe(home);
        });
      }
    }

    it("reads and triages nothing for a non-Admin", async () => {
      answerAs(CLIENT_USER);

      for (const run of Object.values(guarded)) await catchOutcome(run);

      expect(listInbox).not.toHaveBeenCalled();
      expect(listClientRequests).not.toHaveBeenCalled();
      expect(getAdminRequest).not.toHaveBeenCalled();
      expect(triageRequest).not.toHaveBeenCalled();
    });
  });

  describe("a cross-origin triage", () => {
    it("is refused with 403 before the body is read", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const inboxPost = inboxTriage(TRIAGE_FIELDS, FOREIGN_ORIGIN);
      const clientPost = clientTriage(TRIAGE_FIELDS, FOREIGN_ORIGIN);

      const inboxThrown = await catchOutcome(() =>
        inboxRequestAction(inboxPost),
      );
      const clientThrown = await catchOutcome(() =>
        clientRequestAction(clientPost),
      );

      expect(inboxThrown).toMatchObject({ init: { status: 403 } });
      expect(clientThrown).toMatchObject({ init: { status: 403 } });
      expect(inboxPost.request.bodyUsed).toBe(false);
      expect(clientPost.request.bodyUsed).toBe(false);
      expect(triageRequest).not.toHaveBeenCalled();
    });
  });

  describe("the inbox loader", () => {
    it("lists New Requests by default", async () => {
      answerAs(ADMIN);

      const outcome = await inboxLoader(getArgs("/admin/requests", {}));

      expect(listInbox).toHaveBeenCalledWith("new");
      expect(outcome).toMatchObject({ data: { filter: "new", rows: [ROW] } });
    });

    it("lists every status for ?status=all", async () => {
      answerAs(ADMIN);

      const outcome = await inboxLoader(
        getArgs("/admin/requests?status=all", {}),
      );

      expect(listInbox).toHaveBeenCalledWith("all");
      expect(outcome).toMatchObject({ data: { filter: "all" } });
    });

    it("gives the page null, not an error, when the list can't load", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "error").mockImplementation(() => {});
      listInbox.mockRejectedValue(new Error("connection refused"));

      const outcome = await inboxLoader(getArgs("/admin/requests", {}));

      expect(outcome).toMatchObject({ data: { rows: null } });
    });
  });

  describe("the Client tab loader", () => {
    const tabArgs = () =>
      getArgs<Parameters<typeof clientRequestsLoader>[0]>(
        `/admin/clients/${CLIENT_ID}/requests`,
        { clientId: CLIENT_ID },
      );

    it("lists the URL's Client's Requests", async () => {
      answerAs(ADMIN);

      const outcome = await clientRequestsLoader(tabArgs());

      expect(listClientRequests).toHaveBeenCalledWith(CLIENT_ID);
      expect(outcome).toMatchObject({
        data: { client: { clientId: CLIENT_ID, name: "Acme" }, rows: [ROW] },
      });
    });

    it("is a 404 for an unknown Client", async () => {
      answerAs(ADMIN);
      getTeam.mockResolvedValue(null);

      const thrown = await catchOutcome(() => clientRequestsLoader(tabArgs()));

      expect(thrown).toMatchObject({ init: { status: 404 } });
    });

    it("gives the page null rows when the list can't load", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "error").mockImplementation(() => {});
      listClientRequests.mockRejectedValue(new Error("connection refused"));

      const outcome = await clientRequestsLoader(tabArgs());

      expect(outcome).toMatchObject({ data: { rows: null } });
    });
  });

  describe("the triage detail loaders", () => {
    it("load the Request with the Client's Task options", async () => {
      answerAs(ADMIN);

      const outcome = await inboxRequestLoader(
        getArgs(INBOX_DETAIL_PATH, INBOX_PARAMS),
      );

      expect(getAdminRequest).toHaveBeenCalledWith(REQUEST_ID, undefined);
      expect(listTaskOptions).toHaveBeenCalledWith(CLIENT_ID, null);
      expect(outcome).toMatchObject({
        data: { request: DETAIL, taskOptions: TASK_GROUPS },
      });
    });

    it("scope the tab detail by the URL's Client", async () => {
      answerAs(ADMIN);

      await clientRequestLoader(getArgs(CLIENT_DETAIL_PATH, CLIENT_PARAMS));

      expect(getAdminRequest).toHaveBeenCalledWith(REQUEST_ID, CLIENT_ID);
    });

    it("404 the tab detail for another Client's Request", async () => {
      answerAs(ADMIN);
      getAdminRequest.mockImplementation(async (_id, clientId) =>
        clientId === OTHER_CLIENT_ID ? DETAIL : null,
      );

      const thrown = await catchOutcome(() =>
        clientRequestLoader(getArgs(CLIENT_DETAIL_PATH, CLIENT_PARAMS)),
      );

      expect(thrown).toMatchObject({ init: { status: 404 } });
    });

    it("404 the tab detail for an unknown Client", async () => {
      answerAs(ADMIN);
      getTeam.mockResolvedValue(null);

      const thrown = await catchOutcome(() =>
        clientRequestLoader(getArgs(CLIENT_DETAIL_PATH, CLIENT_PARAMS)),
      );

      expect(thrown).toMatchObject({ init: { status: 404 } });
    });

    for (const requestId of [
      "0199d0a4-5b6c-7d8e-9f01-000000000000",
      "not-a-uuid",
    ]) {
      it(`404 both routes for the id ${requestId}`, async () => {
        answerAs(ADMIN);
        getAdminRequest.mockResolvedValue(null);

        const inboxThrown = await catchOutcome(() =>
          inboxRequestLoader(
            getArgs(`/admin/requests/${requestId}`, { requestId }),
          ),
        );
        const clientThrown = await catchOutcome(() =>
          clientRequestLoader(
            getArgs(`/admin/clients/${CLIENT_ID}/requests/${requestId}`, {
              clientId: CLIENT_ID,
              requestId,
            }),
          ),
        );

        expect(inboxThrown).toMatchObject({ init: { status: 404 } });
        expect(clientThrown).toMatchObject({ init: { status: 404 } });
      });
    }

    it("give the page null, not an error, when the Request can't load", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "error").mockImplementation(() => {});
      getAdminRequest.mockRejectedValue(new Error("connection refused"));

      const outcome = await inboxRequestLoader(
        getArgs(INBOX_DETAIL_PATH, INBOX_PARAMS),
      );

      expect(outcome).toMatchObject({
        data: { request: null, taskOptions: null },
      });
    });

    it("give the form null options when the Tasks can't load", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "error").mockImplementation(() => {});
      listTaskOptions.mockRejectedValue(new Error("connection refused"));

      const outcome = await inboxRequestLoader(
        getArgs(INBOX_DETAIL_PATH, INBOX_PARAMS),
      );

      expect(outcome).toMatchObject({
        data: { request: DETAIL, taskOptions: null },
      });
    });

    it("skip the Task options for a read-only Request", async () => {
      answerAs(ADMIN);
      getAdminRequest.mockResolvedValue({ ...DETAIL, status: "WITHDRAWN" });

      await inboxRequestLoader(getArgs(INBOX_DETAIL_PATH, INBOX_PARAMS));

      expect(listTaskOptions).not.toHaveBeenCalled();
    });
  });

  describe("the triage action", () => {
    it("saves the posted status, note and Task", async () => {
      answerAs(ADMIN);

      const outcome = await inboxRequestAction(inboxTriage());

      expect(triageRequest).toHaveBeenCalledWith(REQUEST_ID, {
        status: "ACCEPTED",
        responseNote: "On it",
        taskId: TASK_ID,
      });
      expect(outcome).toMatchObject({
        data: { kind: "saved" },
        init: { status: 200 },
      });
    });

    it("passes no Task when the form sent none", async () => {
      answerAs(ADMIN);

      await inboxRequestAction(
        inboxTriage({ status: "DECLINED", responseNote: "" }),
      );

      expect(triageRequest).toHaveBeenCalledWith(REQUEST_ID, {
        status: "DECLINED",
        responseNote: "",
        taskId: null,
      });
    });

    for (const [error, status] of [
      ["withdrawn", 409],
      ["archived", 409],
      ["task-not-found", 422],
      ["invalid", 422],
    ] as const) {
      it(`maps the module's ${error} refusal`, async () => {
        answerAs(ADMIN);
        triageRequest.mockResolvedValue({ value: null, error, status });

        const outcome = await inboxRequestAction(inboxTriage());

        expect(outcome).toMatchObject({
          data: { kind: "refused", error },
          init: { status },
        });
      });
    }

    it("answers a crash with a failure, not the error page", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "error").mockImplementation(() => {});
      triageRequest.mockRejectedValue(new Error("connection refused"));

      const outcome = await inboxRequestAction(inboxTriage());

      expect(outcome).toMatchObject({
        data: { kind: "failed" },
        init: { status: 500 },
      });
    });

    it("refuses another Client's Request on the tab route", async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      getAdminRequest.mockResolvedValue(null);

      const outcome = await clientRequestAction(clientTriage());

      expect(getAdminRequest).toHaveBeenCalledWith(REQUEST_ID, CLIENT_ID);
      expect(outcome).toMatchObject({
        data: { kind: "refused", error: "not-found" },
        init: { status: 404 },
      });
      expect(triageRequest).not.toHaveBeenCalled();
    });

    it("saves the Client's own Request on the tab route", async () => {
      answerAs(ADMIN);

      const outcome = await clientRequestAction(clientTriage());

      expect(triageRequest).toHaveBeenCalledWith(REQUEST_ID, TRIAGE_FIELDS);
      expect(outcome).toMatchObject({ data: { kind: "saved" } });
    });
  });

  describe("after a refused triage", () => {
    const args = (actionResult: unknown) =>
      ({
        currentUrl: new URL(`${PORTAL_ORIGIN}${CLIENT_DETAIL_PATH}`),
        nextUrl: new URL(`${PORTAL_ORIGIN}${CLIENT_DETAIL_PATH}`),
        formMethod: "POST",
        actionStatus: 409,
        actionResult,
        defaultShouldRevalidate: false,
      }) as Parameters<typeof clientRequestShouldRevalidate>[0];

    it("reloads the detail when the Request went read-only", () => {
      expect(
        clientRequestShouldRevalidate(
          args({ kind: "refused", error: "withdrawn" }),
        ),
      ).toBe(true);
      expect(
        clientRequestShouldRevalidate(
          args({ kind: "refused", error: "archived" }),
        ),
      ).toBe(true);
    });

    it("keeps the detail for a field error", () => {
      expect(
        clientRequestShouldRevalidate(
          args({ kind: "refused", error: "invalid" }),
        ),
      ).toBe(false);
    });
  });
});
