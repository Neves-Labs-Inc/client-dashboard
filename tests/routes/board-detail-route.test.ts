import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, Auth, Team } from "@/lib/auth/auth";
import type { BoardDetail, BoardSync } from "@/lib/board-sync/board-sync";
import { loader } from "@/routes/admin/client-board";

// The session store and the board-sync module are the boundaries.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();
const getBoardDetail = vi.fn<BoardSync["getBoardDetail"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
  },
}));

vi.mock("@/lib/board-sync/board-sync.server", () => ({
  boardSync: {
    isGithubConnected: true,
    getBoardDetail: (clientId: string, projectId: string) =>
      getBoardDetail(clientId, projectId),
  },
}));

const ORIGIN = "http://localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const PROJECT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
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
const DETAIL: BoardDetail = {
  id: PROJECT_ID,
  name: "Acme app",
  url: "https://github.com/orgs/neves-labs/projects/1",
  state: "linked",
  unlinkedAt: null,
  isClientArchived: false,
  lastSyncedAt: null,
  lastSyncError: null,
  syncWarnings: [],
  unmappedCount: 0,
  health: null,
  fieldChecks: [],
  milestones: [],
  tasks: [],
  hiddenCount: 0,
};

function answerAs(access: Access): void {
  getAccess.mockResolvedValue({ access, headers: new Headers() });
}

function loaderArgs(): Parameters<typeof loader>[0] {
  const request = new Request(
    `${ORIGIN}/admin/clients/${CLIENT_ID}/projects/${PROJECT_ID}`,
  );
  // The loader reads only the request and params.
  return {
    request,
    params: { clientId: CLIENT_ID, projectId: PROJECT_ID },
    context: {},
  } as Parameters<typeof loader>[0];
}

// What the loader returned or threw.
async function settle(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    return thrown;
  }
}

beforeEach(() => {
  getAccess.mockReset();
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  getBoardDetail.mockReset();
  getBoardDetail.mockResolvedValue(DETAIL);
});

describe("the board detail loader", () => {
  it("sends a Client User to their own area and reads nothing", async () => {
    answerAs(CLIENT_USER);

    const outcome = await settle(() => loader(loaderArgs()));

    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).headers.get("location")).toBe("/overview");
    expect(getBoardDetail).not.toHaveBeenCalled();
  });

  it("loads the Client's board, scoped by the URL's Client", async () => {
    answerAs(ADMIN);

    const outcome = await loader(loaderArgs());

    expect(getBoardDetail).toHaveBeenCalledWith(CLIENT_ID, PROJECT_ID);
    expect(outcome).toMatchObject({
      data: { detail: DETAIL, isGithubConnected: true },
    });
  });

  it("is a 404 for a Project of another Client", async () => {
    answerAs(ADMIN);
    getBoardDetail.mockResolvedValue(null);

    const thrown = await settle(() => loader(loaderArgs()));

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("is a 404 for an unknown Client", async () => {
    answerAs(ADMIN);
    getTeam.mockResolvedValue(null);

    const thrown = await settle(() => loader(loaderArgs()));

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("gives the page null, not an error, when the board can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    getBoardDetail.mockRejectedValue(new Error("connection refused"));

    const outcome = await loader(loaderArgs());

    expect(outcome).toMatchObject({ data: { detail: null } });
  });
});
