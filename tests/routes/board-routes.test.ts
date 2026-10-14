import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSync } from "@/lib/board-sync/board-sync";
import type { Access, AccessResult, Auth, Team } from "@/lib/auth/auth";
import {
  action as projectsAction,
  loader as projectsLoader,
} from "@/routes/admin/client-projects";
import { action as homeAction } from "@/routes/admin/index";
import { loader as linkDraftLoader } from "@/routes/admin/link-draft";

// The session store and the board-sync module are the boundaries.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();
const link = vi.fn<BoardSync["link"]>();
const getLinkDraft = vi.fn<BoardSync["getLinkDraft"]>();
const syncNow = vi.fn<BoardSync["syncNow"]>();
const listProjects = vi.fn<BoardSync["listProjects"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
    listClients: async () => [],
  },
}));

vi.mock("@/lib/board-sync/board-sync.server", () => ({
  boardSync: {
    isGithubConnected: true,
    link: (...args: Parameters<BoardSync["link"]>) => link(...args),
    getLinkDraft: (nodeId: string) => getLinkDraft(nodeId),
    syncNow: (projectId: string) => syncNow(projectId),
    listProjects: (clientId: string) => listProjects(clientId),
    listUnassignedBoards: async () => [],
  },
}));

const ORIGIN = "http://localhost:5173";
const SIBLING_ORIGIN = "http://www.localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const PROJECT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const BOARD_ID = "PVT_kwDOBoard";
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const NEEDS_PASSKEY: Access = {
  kind: "admin-needs-passkey",
  email: "admin@test.local",
};
const TEAM: Team = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
  members: [],
  pendingInvitations: [],
  canInviteFirstOwner: false,
};

function answerAs(access: Access): void {
  getAccess.mockResolvedValue({ access, headers: new Headers() });
}

function postArgs<Args>(
  path: string,
  fields: Record<string, string>,
  params: Record<string, string> = {},
  origin = ORIGIN,
): Args {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  const request = new Request(`${ORIGIN}${path}`, {
    method: "POST",
    body,
    headers: { origin },
  });
  // Actions read only the request and params.
  return { request, params, context: {} } as Args;
}

function linkArgs<Args>(origin = ORIGIN): Args {
  return postArgs<Args>(
    "/admin?index",
    {
      intent: "link",
      boardNodeId: BOARD_ID,
      clientId: CLIENT_ID,
      options: JSON.stringify([
        { id: "opt_todo", name: "Todo" },
        { id: "opt_done", name: "Done" },
      ]),
      "mapping.opt_todo": "",
      "mapping.opt_done": "DONE",
    },
    {},
    origin,
  );
}

function syncArgs<Args>(origin = ORIGIN): Args {
  return postArgs<Args>(
    `/admin/clients/${CLIENT_ID}/projects`,
    { intent: "sync-now", projectId: PROJECT_ID },
    { clientId: CLIENT_ID },
    origin,
  );
}

function draftArgs<Args>(): Args {
  const request = new Request(`${ORIGIN}/admin/boards/${BOARD_ID}/link-draft`);
  return { request, params: { nodeId: BOARD_ID }, context: {} } as Args;
}

// What a loader or action returned or threw.
async function settle(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    return thrown;
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  getAccess.mockReset();
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  link.mockReset();
  link.mockResolvedValue({
    value: { projectId: PROJECT_ID, firstSyncFailed: false },
    error: null,
    status: 201,
  });
  getLinkDraft.mockReset();
  syncNow.mockReset();
  syncNow.mockResolvedValue({ value: null, error: null, status: 200 });
  listProjects.mockReset();
  listProjects.mockResolvedValue([]);
});

describe("the board routes' Admin guard", () => {
  const guarded = {
    "link action": () => homeAction(linkArgs()),
    "sync-now action": () => projectsAction(syncArgs()),
    "link-draft loader": () => linkDraftLoader(draftArgs()),
  };

  for (const [use, run] of Object.entries(guarded)) {
    it(`sends a magic-link session from the ${use} to /passkey`, async () => {
      answerAs(NEEDS_PASSKEY);

      const outcome = await settle(run);

      expect(outcome).toBeInstanceOf(Response);
      expect((outcome as Response).headers.get("location")).toBe("/passkey");
    });
  }

  it("links, syncs and loads nothing for a non-Admin", async () => {
    answerAs(NEEDS_PASSKEY);

    for (const run of Object.values(guarded)) await settle(run);

    expect(link).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
    expect(getLinkDraft).not.toHaveBeenCalled();
  });
});

describe("a cross-origin board mutation", () => {
  it("is refused with 403 before the body is read", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const linkPost = linkArgs<Parameters<typeof homeAction>[0]>(SIBLING_ORIGIN);
    const syncPost =
      syncArgs<Parameters<typeof projectsAction>[0]>(SIBLING_ORIGIN);

    const linkThrown = await settle(() => homeAction(linkPost));
    const syncThrown = await settle(() => projectsAction(syncPost));

    expect(linkThrown).toMatchObject({ init: { status: 403 } });
    expect(syncThrown).toMatchObject({ init: { status: 403 } });
    expect(linkPost.request.bodyUsed).toBe(false);
    expect(syncPost.request.bodyUsed).toBe(false);
    expect(link).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });
});

describe("the link action", () => {
  it("links the posted board with the drawer's mapping", async () => {
    answerAs(ADMIN);

    const outcome = await homeAction(linkArgs());

    expect(link).toHaveBeenCalledWith({
      boardNodeId: BOARD_ID,
      clientId: CLIENT_ID,
      options: [
        { id: "opt_todo", name: "Todo" },
        { id: "opt_done", name: "Done" },
      ],
      mapping: { opt_todo: null, opt_done: "DONE" },
    });
    expect(outcome).toMatchObject({
      data: {
        kind: "linked",
        clientId: CLIENT_ID,
        projectId: PROJECT_ID,
        firstSyncFailed: false,
      },
      init: { status: 201 },
    });
  });

  it("passes a refusal on with its status", async () => {
    answerAs(ADMIN);
    link.mockResolvedValue({ value: null, error: "archived", status: 409 });

    const outcome = await homeAction(linkArgs());

    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "archived" },
      init: { status: 409 },
    });
  });
});

describe("the link action's options", () => {
  it("refuses malformed options with 400 and links nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const args = postArgs<Parameters<typeof homeAction>[0]>("/admin?index", {
      intent: "link",
      boardNodeId: BOARD_ID,
      clientId: CLIENT_ID,
      options: "{not json",
      "mapping.opt_done": "DONE",
    });

    const outcome = await homeAction(args);

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 400 },
    });
    expect(link).not.toHaveBeenCalled();
  });
});

describe("the sync-now action", () => {
  it("refuses a Project of another Client with 404 and syncs nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    listProjects.mockResolvedValue([]);

    const outcome = await projectsAction(syncArgs());

    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "not-found" },
      init: { status: 404 },
    });
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("answers a failed sync with the Project's recorded error", async () => {
    answerAs(ADMIN);
    syncNow.mockResolvedValue({
      value: null,
      error: "sync-failed",
      status: 502,
    });
    listProjects.mockResolvedValue([
      {
        id: PROJECT_ID,
        name: "Acme app",
        url: "https://github.com/orgs/neves-labs/projects/1",
        state: "linked",
        unlinkedAt: null,
        lastSyncedAt: null,
        lastSyncError: "Rate limited",
        unmappedCount: 0,
      },
    ]);

    const outcome = await projectsAction(syncArgs());

    expect(syncNow).toHaveBeenCalledWith(PROJECT_ID);
    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "sync-failed", message: "Rate limited" },
      init: { status: 502 },
    });
  });
});

describe("the Projects loader", () => {
  it("is a 404 for an unknown Client", async () => {
    answerAs(ADMIN);
    getTeam.mockResolvedValue(null);

    const thrown = await settle(() =>
      projectsLoader(
        postArgs(
          `/admin/clients/${CLIENT_ID}/projects`,
          {},
          {
            clientId: CLIENT_ID,
          },
        ),
      ),
    );

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("gives the panel null, not an error, when the Projects can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listProjects.mockRejectedValue(new Error("connection refused"));

    const outcome = await projectsLoader(
      postArgs(
        `/admin/clients/${CLIENT_ID}/projects`,
        {},
        {
          clientId: CLIENT_ID,
        },
      ),
    );

    expect(outcome).toMatchObject({ data: { projects: null } });
  });
});
