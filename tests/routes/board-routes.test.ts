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
const getMapping = vi.fn<BoardSync["getMapping"]>();
const saveMapping = vi.fn<BoardSync["saveMapping"]>();
const unlink = vi.fn<BoardSync["unlink"]>();
const deleteProject = vi.fn<BoardSync["deleteProject"]>();

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
    getMapping: (projectId: string) => getMapping(projectId),
    saveMapping: (...args: Parameters<BoardSync["saveMapping"]>) =>
      saveMapping(...args),
    unlink: (projectId: string) => unlink(projectId),
    deleteProject: (projectId: string) => deleteProject(projectId),
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

function saveMappingArgs<Args>(origin = ORIGIN): Args {
  return postArgs<Args>(
    `/admin/clients/${CLIENT_ID}/projects`,
    {
      intent: "save-mapping",
      projectId: PROJECT_ID,
      "mapping.opt_todo": "UP_NEXT",
      "mapping.opt_review": "",
      "mapping.opt_done": "DONE",
    },
    { clientId: CLIENT_ID },
    origin,
  );
}

function removeArgs<Args>(intent: "unlink" | "delete", origin = ORIGIN): Args {
  return postArgs<Args>(
    `/admin/clients/${CLIENT_ID}/projects`,
    { intent, projectId: PROJECT_ID },
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
  getMapping.mockReset();
  saveMapping.mockReset();
  saveMapping.mockResolvedValue({ value: null, error: null, status: 200 });
  unlink.mockReset();
  unlink.mockResolvedValue({ value: null, error: null, status: 200 });
  deleteProject.mockReset();
  deleteProject.mockResolvedValue({ value: null, error: null, status: 200 });
});

const OWN_PROJECT = {
  id: PROJECT_ID,
  name: "Acme app",
  url: "https://github.com/orgs/neves-labs/projects/1",
  state: "linked",
  unlinkedAt: null,
  lastSyncedAt: null,
  lastSyncError: null,
  unmappedCount: 0,
} as const;

describe("the board routes' Admin guard", () => {
  const guarded = {
    "link action": () => homeAction(linkArgs()),
    "sync-now action": () => projectsAction(syncArgs()),
    "save-mapping action": () => projectsAction(saveMappingArgs()),
    "unlink action": () => projectsAction(removeArgs("unlink")),
    "delete action": () => projectsAction(removeArgs("delete")),
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
    expect(saveMapping).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
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
    const mappingPost =
      saveMappingArgs<Parameters<typeof projectsAction>[0]>(SIBLING_ORIGIN);

    const unlinkPost = removeArgs<Parameters<typeof projectsAction>[0]>(
      "unlink",
      SIBLING_ORIGIN,
    );
    const deletePost = removeArgs<Parameters<typeof projectsAction>[0]>(
      "delete",
      SIBLING_ORIGIN,
    );

    const linkThrown = await settle(() => homeAction(linkPost));
    const unlinkThrown = await settle(() => projectsAction(unlinkPost));
    const deleteThrown = await settle(() => projectsAction(deletePost));
    const syncThrown = await settle(() => projectsAction(syncPost));
    const mappingThrown = await settle(() => projectsAction(mappingPost));

    expect(linkThrown).toMatchObject({ init: { status: 403 } });
    expect(syncThrown).toMatchObject({ init: { status: 403 } });
    expect(mappingThrown).toMatchObject({ init: { status: 403 } });
    expect(unlinkThrown).toMatchObject({ init: { status: 403 } });
    expect(deleteThrown).toMatchObject({ init: { status: 403 } });
    expect(unlinkPost.request.bodyUsed).toBe(false);
    expect(deletePost.request.bodyUsed).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
    expect(linkPost.request.bodyUsed).toBe(false);
    expect(syncPost.request.bodyUsed).toBe(false);
    expect(mappingPost.request.bodyUsed).toBe(false);
    expect(link).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
    expect(saveMapping).not.toHaveBeenCalled();
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

  it("refuses a mapping with an unknown status with 400 and links nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const args = postArgs<Parameters<typeof homeAction>[0]>("/admin?index", {
      intent: "link",
      boardNodeId: BOARD_ID,
      clientId: CLIENT_ID,
      options: JSON.stringify([{ id: "opt_done", name: "Done" }]),
      "mapping.opt_done": "SHIPPED",
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

describe("the save-mapping action", () => {
  it("saves the posted mapping for the Client's Project", async () => {
    answerAs(ADMIN);
    listProjects.mockResolvedValue([OWN_PROJECT]);

    const outcome = await projectsAction(saveMappingArgs());

    expect(saveMapping).toHaveBeenCalledWith(PROJECT_ID, {
      opt_todo: "UP_NEXT",
      opt_review: null,
      opt_done: "DONE",
    });
    expect(outcome).toMatchObject({
      data: { kind: "saved" },
      init: { status: 200 },
    });
  });

  it("refuses a Project of another Client with 404 and saves nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await projectsAction(saveMappingArgs());

    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "not-found" },
      init: { status: 404 },
    });
    expect(saveMapping).not.toHaveBeenCalled();
  });

  it("passes the module's refusal on with its status", async () => {
    answerAs(ADMIN);
    listProjects.mockResolvedValue([OWN_PROJECT]);
    saveMapping.mockResolvedValue({
      value: null,
      error: "unlinked",
      status: 409,
    });

    const outcome = await projectsAction(saveMappingArgs());

    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "unlinked" },
      init: { status: 409 },
    });
  });

  it("refuses a mapping with an unknown status with 400 and saves nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    listProjects.mockResolvedValue([OWN_PROJECT]);
    const args = postArgs<Parameters<typeof projectsAction>[0]>(
      `/admin/clients/${CLIENT_ID}/projects`,
      {
        intent: "save-mapping",
        projectId: PROJECT_ID,
        "mapping.opt_todo": "X",
      },
      { clientId: CLIENT_ID },
    );

    const outcome = await projectsAction(args);

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 400 },
    });
    expect(saveMapping).not.toHaveBeenCalled();
  });

  it("answers a crash with a failure, not the error page", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listProjects.mockResolvedValue([OWN_PROJECT]);
    saveMapping.mockRejectedValue(new Error("connection refused"));

    const outcome = await projectsAction(saveMappingArgs());

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
  });
});

describe("the unlink and delete actions", () => {
  it("unlinks the Client's Project", async () => {
    answerAs(ADMIN);
    listProjects.mockResolvedValue([OWN_PROJECT]);

    const outcome = await projectsAction(removeArgs("unlink"));

    expect(unlink).toHaveBeenCalledWith(PROJECT_ID);
    expect(outcome).toMatchObject({
      data: { kind: "unlinked" },
      init: { status: 200 },
    });
  });

  it("deletes the Client's Project", async () => {
    answerAs(ADMIN);
    listProjects.mockResolvedValue([OWN_PROJECT]);

    const outcome = await projectsAction(removeArgs("delete"));

    expect(deleteProject).toHaveBeenCalledWith(PROJECT_ID);
    expect(outcome).toMatchObject({
      data: { kind: "deleted" },
      init: { status: 200 },
    });
  });

  it("refuses a Project of another Client with 404 and changes nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const unlinked = await projectsAction(removeArgs("unlink"));
    const deleted = await projectsAction(removeArgs("delete"));

    for (const outcome of [unlinked, deleted]) {
      expect(outcome).toMatchObject({
        data: { kind: "refused", error: "not-found" },
        init: { status: 404 },
      });
    }
    expect(unlink).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("passes the module's refusal on with its status", async () => {
    answerAs(ADMIN);
    listProjects.mockResolvedValue([OWN_PROJECT]);
    deleteProject.mockResolvedValue({
      value: null,
      error: "archived",
      status: 409,
    });

    const outcome = await projectsAction(removeArgs("delete"));

    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "archived" },
      init: { status: 409 },
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

  it("loads the mapping of the Project in ?map, when it is the Client's", async () => {
    answerAs(ADMIN);
    listProjects.mockResolvedValue([OWN_PROJECT]);
    const mapping = {
      projectName: "Acme app",
      options: [{ id: "opt_todo", name: "Todo", clientStatus: null }],
    };
    getMapping.mockResolvedValue(mapping);

    const outcome = await projectsLoader(
      mapArgs(PROJECT_ID) as Parameters<typeof projectsLoader>[0],
    );

    expect(outcome).toMatchObject({
      data: { mapping: { projectId: PROJECT_ID, mapping } },
    });
  });

  it("loads no mapping for a Project of another Client", async () => {
    answerAs(ADMIN);
    getMapping.mockResolvedValue({ projectName: "Other", options: [] });

    const outcome = await projectsLoader(
      mapArgs(PROJECT_ID) as Parameters<typeof projectsLoader>[0],
    );

    expect(outcome).toMatchObject({
      data: { mapping: { projectId: PROJECT_ID, mapping: null } },
    });
    expect(getMapping).not.toHaveBeenCalled();
  });

  it('gives the drawer "failed", not the error page, when the mapping can\'t load', async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listProjects.mockResolvedValue([OWN_PROJECT]);
    getMapping.mockRejectedValue(new Error("connection refused"));

    const outcome = await projectsLoader(
      mapArgs(PROJECT_ID) as Parameters<typeof projectsLoader>[0],
    );

    expect(outcome).toMatchObject({
      data: { mapping: { projectId: PROJECT_ID, mapping: "failed" } },
    });
  });

  it("loads no mapping without ?map", async () => {
    answerAs(ADMIN);

    const outcome = await projectsLoader(
      mapArgs(null) as Parameters<typeof projectsLoader>[0],
    );

    expect(outcome).toMatchObject({ data: { mapping: null } });
    expect(getMapping).not.toHaveBeenCalled();
  });
});

function mapArgs(projectId: string | null): unknown {
  const search = projectId === null ? "" : `?map=${projectId}`;
  const request = new Request(
    `${ORIGIN}/admin/clients/${CLIENT_ID}/projects${search}`,
  );
  return { request, params: { clientId: CLIENT_ID }, context: {} };
}
