import type { BoardSync } from "@/lib/board-sync/board-sync";

// A BoardSync for tests of its callers: pass the methods the test drives.
// Any other method throws, so a test that hits an unexpected path fails loudly.
export function createStubBoardSync(overrides: Partial<BoardSync>): BoardSync {
  const notStubbed = (method: string) => () => {
    throw new Error(`BoardSync.${method} is not stubbed in this test`);
  };
  return {
    isGithubConnected: true,
    listUnassignedBoards: notStubbed("listUnassignedBoards"),
    getLinkDraft: notStubbed("getLinkDraft"),
    link: notStubbed("link"),
    listProjects: notStubbed("listProjects"),
    getMapping: notStubbed("getMapping"),
    saveMapping: notStubbed("saveMapping"),
    unlink: notStubbed("unlink"),
    deleteProject: notStubbed("deleteProject"),
    syncNow: notStubbed("syncNow"),
    refreshPool: notStubbed("refreshPool"),
    syncBoardByNodeId: notStubbed("syncBoardByNodeId"),
    syncBoardsWithIssue: notStubbed("syncBoardsWithIssue"),
    syncBoardsWithRepository: notStubbed("syncBoardsWithRepository"),
    reconcile: notStubbed("reconcile"),
    syncProject: notStubbed("syncProject"),
    ...overrides,
  };
}
