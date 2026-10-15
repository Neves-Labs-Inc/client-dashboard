import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createBoardSync } from "@/lib/board-sync/board-sync";
import { createDb } from "@/lib/db/db";
import { clients, githubBoards } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import type { PmBoard } from "@/lib/pm-source/pm-source";
import { deleteClients, insertClients } from "../../support/clients";
import {
  buildBoard,
  buildIssue,
  buildStatusOption,
  buildStatusUpdate,
  FakePmSource,
} from "../../support/pm-board";

const NOW = new Date("2026-10-14T15:00:00Z");
// Long enough for the unlink or delete to queue behind the running sync.
const SYNC_DELAY_MS = 300;
const CHILD_TABLES = [
  "tasks",
  "milestones",
  "status_updates",
  "project_status_mappings",
];

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const owner = new pg.Client({
  connectionString: getMigrateEnv().DATABASE_URL_OWNER,
});
let isOwnerConnected = false;
const createdClientIds: string[] = [];
const createdBoardIds: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  try {
    const cleaner = await getOwner();
    // Projects cascade to every other board table; clients don't cascade.
    await cleaner.query("delete from projects where client_id = any($1)", [
      createdClientIds,
    ]);
    await deleteClients(cleaner, createdClientIds);
    await cleaner.query("delete from github_boards where node_id = any($1)", [
      createdBoardIds,
    ]);
  } finally {
    await owner.end();
    await db.close();
  }
});

// The owner bypasses RLS, so it sees every board row there is.
async function getOwner(): Promise<pg.Client> {
  if (!isOwnerConnected) {
    await owner.connect();
    isOwnerConnected = true;
  }
  return owner;
}

async function seedClient(): Promise<string> {
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem((tx) => insertClients(tx, [clientId]));
  return clientId;
}

async function archiveClient(clientId: string): Promise<void> {
  await db.withSystem((tx) =>
    tx.update(clients).set({ archivedAt: NOW }).where(eq(clients.id, clientId)),
  );
}

type LinkedBoard = {
  sync: ReturnType<typeof createBoardSync>;
  pmSource: FakePmSource;
  clientId: string;
  projectId: string;
  board: PmBoard;
};

// A board with a Status column, a Visible issue in a milestone and a status
// update, linked to a new Client and synced: every child table has rows.
async function linkBoard(): Promise<LinkedBoard> {
  const pmSource = new FakePmSource();
  const todo = buildStatusOption("Todo");
  const board = buildBoard({
    statusOptions: [todo],
    items: [
      buildIssue({
        statusOptionId: todo.id,
        milestone: { title: "Launch", dueOn: "2026-11-01" },
      }),
    ],
    statusUpdates: [buildStatusUpdate()],
  });
  createdBoardIds.push(board.nodeId);
  await db.withSystem((tx) =>
    tx.insert(githubBoards).values({
      nodeId: board.nodeId,
      number: board.number,
      title: board.title,
      url: board.url,
      closed: board.closed,
      githubUpdatedAt: board.updatedAt,
      refreshedAt: NOW,
    }),
  );
  pmSource.setBoard(board.nodeId, board);
  const sync = createBoardSync({ db, pmSource, now: () => NOW });
  const clientId = await seedClient();
  const linked = await sync.link({
    boardNodeId: board.nodeId,
    clientId,
    mapping: { [todo.id]: "UP_NEXT" },
    options: [todo],
  });
  return {
    sync,
    pmSource,
    clientId,
    projectId: linked.value?.projectId ?? "",
    board,
  };
}

async function countChildRows(
  projectId: string,
): Promise<Record<string, number>> {
  const cleaner = await getOwner();
  const counts: Record<string, number> = {};
  // One client runs one query at a time.
  for (const table of CHILD_TABLES) {
    const { rows } = await cleaner.query<{ count: number }>(
      `select count(*)::int as count from ${table} where project_id = $1`,
      [projectId],
    );
    counts[table] = rows[0].count;
  }
  return counts;
}

function isUnassigned(
  boards: Awaited<
    ReturnType<ReturnType<typeof createBoardSync>["listUnassignedBoards"]>
  >,
  nodeId: string,
): boolean {
  return boards !== "github-off" && boards.some((b) => b.nodeId === nodeId);
}

describe("unlink", () => {
  it("freezes the Project and returns its board to the unassigned list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId, board } = await linkBoard();
    const later = new Date("2026-10-15T09:00:00Z");
    const unlinkSync = createBoardSync({
      db,
      pmSource: new FakePmSource(),
      now: () => later,
    });

    const result = await unlinkSync.unlink(projectId);

    expect(result).toEqual({ value: null, error: null, status: 200 });
    const [project] = await sync.listProjects(clientId);
    expect(project).toMatchObject({ state: "unlinked", unlinkedAt: later });
    expect(isUnassigned(await sync.listUnassignedBoards(), board.nodeId)).toBe(
      true,
    );
    // Frozen as it is: nothing it mirrored is gone.
    expect(await countChildRows(projectId)).toEqual({
      tasks: 1,
      milestones: 1,
      status_updates: 1,
      project_status_mappings: 1,
    });
  });

  it("succeeds without a change when the Project is already unlinked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId } = await linkBoard();
    await sync.unlink(projectId);
    const later = createBoardSync({
      db,
      pmSource: new FakePmSource(),
      now: () => new Date("2026-12-01T00:00:00Z"),
    });

    const result = await later.unlink(projectId);

    expect(result).toEqual({ value: null, error: null, status: 200 });
    const [project] = await sync.listProjects(clientId);
    expect(project.unlinkedAt).toEqual(NOW);
  });

  it("makes a later sync skip the Project as unlinked, changing nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, pmSource, clientId, projectId, board } = await linkBoard();
    await sync.unlink(projectId);
    pmSource.setBoard(board.nodeId, { ...board, title: "Renamed", items: [] });
    const callsBefore = pmSource.getBoardCalls.length;

    const result = await sync.syncProject(projectId);

    expect(result.error).toBe("unlinked");
    expect(pmSource.getBoardCalls.length).toBe(callsBefore);
    const [project] = await sync.listProjects(clientId);
    expect(project.name).toBe(board.title);
    expect((await countChildRows(projectId)).tasks).toBe(1);
  });

  it("waits for a running sync of the Project before it unlinks", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, pmSource, clientId, projectId, board } = await linkBoard();
    pmSource.setBoard(board.nodeId, { ...board, title: "Renamed" });
    pmSource.nextGetBoardDelayMs = SYNC_DELAY_MS;

    const running = sync.syncProject(projectId);
    // Lets the sync take its lock first.
    await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS / 3));
    const [syncResult, unlinkResult] = await Promise.all([
      running,
      sync.unlink(projectId),
    ]);

    expect(syncResult.error).toBeNull();
    expect(unlinkResult.error).toBeNull();
    const [project] = await sync.listProjects(clientId);
    expect(project).toMatchObject({ name: "Renamed", state: "unlinked" });
  });

  it("refuses an archived Client's Project and an unknown one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId } = await linkBoard();
    await archiveClient(clientId);

    const archived = await sync.unlink(projectId);
    const unknown = await sync.unlink(randomUUID());
    const malformed = await sync.unlink("not-a-uuid");

    expect(archived).toEqual({ value: null, error: "archived", status: 409 });
    expect(unknown).toEqual({ value: null, error: "not-found", status: 404 });
    expect(malformed).toEqual({ value: null, error: "not-found", status: 404 });
    const [project] = await sync.listProjects(clientId);
    expect(project.state).toBe("linked");
  });
});

describe("an archived Client's unlinked Project", () => {
  it("refuses both unlink and delete as archived", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId } = await linkBoard();
    await sync.unlink(projectId);
    await archiveClient(clientId);

    const unlinked = await sync.unlink(projectId);
    const deleted = await sync.deleteProject(projectId);

    expect(unlinked).toEqual({ value: null, error: "archived", status: 409 });
    expect(deleted).toEqual({ value: null, error: "archived", status: 409 });
    expect(await sync.listProjects(clientId)).toHaveLength(1);
  });
});

describe("deleteProject", () => {
  it("deletes the Project and every row it owns", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId, board } = await linkBoard();

    const result = await sync.deleteProject(projectId);

    expect(result).toEqual({ value: null, error: null, status: 200 });
    expect(await sync.listProjects(clientId)).toEqual([]);
    expect(await countChildRows(projectId)).toEqual({
      tasks: 0,
      milestones: 0,
      status_updates: 0,
      project_status_mappings: 0,
    });
    expect(isUnassigned(await sync.listUnassignedBoards(), board.nodeId)).toBe(
      true,
    );
  });

  it("frees the board for a new link to another Client", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, projectId, board } = await linkBoard();
    await sync.deleteProject(projectId);
    const otherClientId = await seedClient();

    const relinked = await sync.link({
      boardNodeId: board.nodeId,
      clientId: otherClientId,
      mapping: {},
      options: board.statusOptions,
    });

    expect(relinked.error).toBeNull();
    expect(relinked.value?.projectId).not.toBe(projectId);
    const projects = await sync.listProjects(otherClientId);
    expect(projects.map((row) => row.state)).toEqual(["linked"]);
  });

  it("deletes an unlinked Project too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId } = await linkBoard();
    await sync.unlink(projectId);

    const result = await sync.deleteProject(projectId);

    expect(result.error).toBeNull();
    expect(await sync.listProjects(clientId)).toEqual([]);
  });

  it("makes a later sync skip the Project as not found", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, projectId } = await linkBoard();
    await sync.deleteProject(projectId);

    const result = await sync.syncProject(projectId);

    expect(result.error).toBe("not-found");
  });

  it("waits for a running sync of the Project before it deletes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, pmSource, clientId, projectId } = await linkBoard();
    pmSource.nextGetBoardDelayMs = SYNC_DELAY_MS;

    const running = sync.syncProject(projectId);
    await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS / 3));
    const [syncResult, deleteResult] = await Promise.all([
      running,
      sync.deleteProject(projectId),
    ]);

    expect(syncResult.error).toBeNull();
    expect(deleteResult.error).toBeNull();
    expect(await sync.listProjects(clientId)).toEqual([]);
  });

  it("refuses an archived Client's Project and an unknown one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sync, clientId, projectId } = await linkBoard();
    await archiveClient(clientId);

    const archived = await sync.deleteProject(projectId);
    const unknown = await sync.deleteProject(randomUUID());
    const malformed = await sync.deleteProject("not-a-uuid");

    expect(archived).toEqual({ value: null, error: "archived", status: 409 });
    expect(unknown).toEqual({ value: null, error: "not-found", status: 404 });
    expect(malformed).toEqual({ value: null, error: "not-found", status: 404 });
    expect(await sync.listProjects(clientId)).toHaveLength(1);
  });

  it("works with GitHub off: both are database-only", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { clientId, projectId } = await linkBoard();
    const offline = createBoardSync({ db, pmSource: null, now: () => NOW });

    expect((await offline.unlink(projectId)).error).toBeNull();
    expect((await offline.deleteProject(projectId)).error).toBeNull();
    expect(await offline.listProjects(clientId)).toEqual([]);
  });
});
