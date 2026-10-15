import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createBoardSync } from "@/lib/board-sync/board-sync";
import { createDb } from "@/lib/db/db";
import {
  clients,
  githubBoards,
  projects,
  projectStatusMappings,
  tasks,
} from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { type PmBoard, PmSourceError } from "@/lib/pm-source/pm-source";
import { deleteClients, insertClients } from "../../support/clients";
import {
  buildBoard,
  buildIssue,
  buildStatusOption,
  FakePmSource,
} from "../../support/pm-board";

const NOW = new Date("2026-10-14T15:00:00Z");

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const createdClientIds: string[] = [];
const createdBoardIds: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    // Projects cascade to every other board table; clients don't cascade.
    await owner.query("delete from projects where client_id = any($1)", [
      createdClientIds,
    ]);
    await deleteClients(owner, createdClientIds);
    await owner.query("delete from github_boards where node_id = any($1)", [
      createdBoardIds,
    ]);
  } finally {
    await owner.end();
    await db.close();
  }
});

function createSync(pmSource: FakePmSource | null = new FakePmSource()) {
  return createBoardSync({ db, pmSource, now: () => NOW });
}

async function seedClient(
  options: { isArchived?: boolean; name?: string } = {},
): Promise<string> {
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    if (options.isArchived) {
      await tx
        .update(clients)
        .set({ archivedAt: NOW })
        .where(eq(clients.id, clientId));
    }
  });
  return clientId;
}

// A board in the org pool, served by `pmSource` as `board`.
async function seedPoolBoard(
  pmSource: FakePmSource,
  overrides: Partial<PmBoard> = {},
): Promise<PmBoard> {
  const board = buildBoard(overrides);
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
  return board;
}

function getProject(projectId: string) {
  return db.withSystem(async (tx) => {
    const [row] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    return row;
  });
}

function getProjectsOfBoard(nodeId: string) {
  return db.withSystem((tx) =>
    tx
      .select()
      .from(projects)
      .where(eq(projects.githubProjectNodeId, nodeId))
      .orderBy(asc(projects.createdAt)),
  );
}

function getMappings(projectId: string) {
  return db.withSystem((tx) =>
    tx
      .select({
        id: projectStatusMappings.githubOptionId,
        name: projectStatusMappings.optionName,
        clientStatus: projectStatusMappings.clientStatus,
      })
      .from(projectStatusMappings)
      .where(eq(projectStatusMappings.projectId, projectId))
      .orderBy(asc(projectStatusMappings.optionName)),
  );
}

async function unlinkProject(projectId: string): Promise<void> {
  await db.withSystem((tx) =>
    tx
      .update(projects)
      .set({ unlinkedAt: NOW })
      .where(eq(projects.id, projectId)),
  );
}

describe("listUnassignedBoards", () => {
  it("lists pool boards with no linked Project, open first, then by title", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const clientId = await seedClient();
    const zebra = await seedPoolBoard(pmSource, { title: "zebra app" });
    const apple = await seedPoolBoard(pmSource, { title: "Apple site" });
    const closed = await seedPoolBoard(pmSource, {
      title: "Aardvark",
      closed: true,
    });
    const linked = await seedPoolBoard(pmSource, { title: "Linked" });
    const frozen = await seedPoolBoard(pmSource, { title: "Mango" });
    await sync.link({
      boardNodeId: linked.nodeId,
      clientId,
      mapping: {},
      options: [],
    });
    const linkedFrozen = await sync.link({
      boardNodeId: frozen.nodeId,
      clientId,
      mapping: {},
      options: [],
    });
    await unlinkProject(linkedFrozen.value?.projectId ?? "");

    const boards = await sync.listUnassignedBoards();

    const seeded = [zebra, apple, closed, linked, frozen].map(
      (board) => board.nodeId,
    );
    expect(boards).not.toBe("github-off");
    const titles = (boards === "github-off" ? [] : boards)
      .filter((board) => seeded.includes(board.nodeId))
      .map((board) => board.title);
    expect(titles).toEqual(["Apple site", "Mango", "zebra app", "Aardvark"]);
  });

  it("returns the board's summary", async () => {
    const pmSource = new FakePmSource();
    const board = await seedPoolBoard(pmSource, {
      number: 12,
      title: "Acme",
      url: "https://github.com/orgs/neves-labs/projects/12",
    });

    const boards = await createSync(pmSource).listUnassignedBoards();

    const found =
      boards === "github-off"
        ? undefined
        : boards.find((row) => row.nodeId === board.nodeId);
    expect(found).toEqual({
      nodeId: board.nodeId,
      number: 12,
      title: "Acme",
      url: "https://github.com/orgs/neves-labs/projects/12",
      closed: false,
      updatedAt: board.updatedAt,
    });
  });

  it("is github-off with GitHub off", async () => {
    expect(await createSync(null).listUnassignedBoards()).toBe("github-off");
  });
});

describe("getLinkDraft", () => {
  it("returns the board, its live options and each Client's frozen mapping", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const todo = buildStatusOption("Todo");
    const done = buildStatusOption("Done");
    const board = await seedPoolBoard(pmSource, {
      statusOptions: [todo, done],
    });
    const clientId = await seedClient();
    const linked = await sync.link({
      boardNodeId: board.nodeId,
      clientId,
      mapping: { [done.id]: "DONE" },
      options: [todo, done],
    });
    await unlinkProject(linked.value?.projectId ?? "");

    const draft = await sync.getLinkDraft(board.nodeId);

    expect(draft.error).toBeNull();
    expect(draft.value?.board).toMatchObject({
      nodeId: board.nodeId,
      title: board.title,
    });
    expect(draft.value?.options).toEqual([todo, done]);
    expect(draft.value?.frozenMappings).toEqual({
      [clientId]: { [todo.id]: null, [done.id]: "DONE" },
    });
  });

  it("lists a Client whose frozen copy has no Status column, with an empty mapping", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const board = await seedPoolBoard(pmSource);
    const clientId = await seedClient();
    const linked = await sync.link({
      boardNodeId: board.nodeId,
      clientId,
      mapping: {},
      options: [],
    });
    await unlinkProject(linked.value?.projectId ?? "");

    const draft = await sync.getLinkDraft(board.nodeId);

    expect(draft.value?.frozenMappings).toEqual({ [clientId]: {} });
  });

  it("ignores mapping keys inherited from Object.prototype", async () => {
    const pmSource = new FakePmSource();
    const option = { id: "constructor", name: "Odd" };
    const board = await seedPoolBoard(pmSource, { statusOptions: [option] });

    const result = await createSync(pmSource).link({
      boardNodeId: board.nodeId,
      clientId: await seedClient(),
      mapping: {},
      options: [option],
    });

    expect(result.error).toBeNull();
    expect(await getMappings(result.value?.projectId ?? "")).toEqual([
      { id: "constructor", name: "Odd", clientStatus: null },
    ]);
  });

  it("is github-failed when GitHub fails, and not-found when the board is gone", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const failing = await seedPoolBoard(pmSource);
    pmSource.setBoard(failing.nodeId, new PmSourceError("GitHub is down"));
    const gone = await seedPoolBoard(pmSource);
    pmSource.setBoard(gone.nodeId, null);

    const failed = await sync.getLinkDraft(failing.nodeId);
    const missing = await sync.getLinkDraft(gone.nodeId);

    expect(failed).toMatchObject({ error: "github-failed", status: 502 });
    expect(missing).toMatchObject({ error: "not-found", status: 404 });
  });

  it("refuses a board outside the pool, a linked one, and GitHub off", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const board = await seedPoolBoard(pmSource);
    await sync.link({
      boardNodeId: board.nodeId,
      clientId: await seedClient(),
      mapping: {},
      options: [],
    });

    expect(await sync.getLinkDraft(`PVT_${randomUUID()}`)).toMatchObject({
      error: "not-found",
    });
    expect(await sync.getLinkDraft(board.nodeId)).toMatchObject({
      error: "already-linked",
      status: 409,
    });
    expect(await createSync(null).getLinkDraft(board.nodeId)).toMatchObject({
      error: "github-off",
    });
  });
});

describe("link", () => {
  it("creates a Project with the drawer's mapping and runs the first sync", async () => {
    const pmSource = new FakePmSource();
    const todo = buildStatusOption("Todo");
    const doing = buildStatusOption("Doing");
    const board = await seedPoolBoard(pmSource, {
      number: 12,
      title: "Acme app",
      url: "https://github.com/orgs/neves-labs/projects/12",
      statusOptions: [todo, doing],
      items: [buildIssue({ title: "Login", statusOptionId: doing.id })],
    });
    const clientId = await seedClient();

    const result = await createSync(pmSource).link({
      boardNodeId: board.nodeId,
      clientId,
      mapping: { [doing.id]: "IN_PROGRESS", opt_unknown: "DONE" },
      options: [todo, doing],
    });

    expect(result).toMatchObject({
      error: null,
      status: 201,
      value: { firstSyncFailed: false },
    });
    const projectId = result.value?.projectId ?? "";
    expect(await getProject(projectId)).toMatchObject({
      clientId,
      githubProjectNodeId: board.nodeId,
      githubProjectNumber: 12,
      name: "Acme app",
      url: "https://github.com/orgs/neves-labs/projects/12",
      unlinkedAt: null,
      lastSyncedAt: NOW,
    });
    expect(await getMappings(projectId)).toEqual([
      { id: doing.id, name: "Doing", clientStatus: "IN_PROGRESS" },
      { id: todo.id, name: "Todo", clientStatus: null },
    ]);
    const taskRows = await db.withSystem((tx) =>
      tx.select().from(tasks).where(eq(tasks.projectId, projectId)),
    );
    expect(taskRows.map((row) => row.title)).toEqual(["Login"]);
  });

  it("revives the same Client's frozen Project, with its new mapping and fresh tasks", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const todo = buildStatusOption("Todo");
    const board = await seedPoolBoard(pmSource, { statusOptions: [todo] });
    const clientId = await seedClient();
    const first = await sync.link({
      boardNodeId: board.nodeId,
      clientId,
      mapping: { [todo.id]: "UP_NEXT" },
      options: [todo],
    });
    const projectId = first.value?.projectId ?? "";
    await unlinkProject(projectId);
    pmSource.setBoard(board.nodeId, {
      ...board,
      items: [buildIssue({ title: "Added while unlinked" })],
    });

    const relinked = await sync.link({
      boardNodeId: board.nodeId,
      clientId,
      mapping: { [todo.id]: "DONE" },
      options: [todo],
    });

    expect(relinked.value?.projectId).toBe(projectId);
    expect(await getProjectsOfBoard(board.nodeId)).toHaveLength(1);
    expect((await getProject(projectId)).unlinkedAt).toBeNull();
    expect(await getMappings(projectId)).toEqual([
      { id: todo.id, name: "Todo", clientStatus: "DONE" },
    ]);
    const taskRows = await db.withSystem((tx) =>
      tx.select().from(tasks).where(eq(tasks.projectId, projectId)),
    );
    expect(taskRows.map((row) => row.title)).toEqual(["Added while unlinked"]);
  });

  it("starts a new Project for another Client, which keeps its frozen one", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const board = await seedPoolBoard(pmSource);
    const firstClientId = await seedClient();
    const secondClientId = await seedClient();
    const first = await sync.link({
      boardNodeId: board.nodeId,
      clientId: firstClientId,
      mapping: {},
      options: [],
    });
    await unlinkProject(first.value?.projectId ?? "");

    const second = await sync.link({
      boardNodeId: board.nodeId,
      clientId: secondClientId,
      mapping: {},
      options: [],
    });

    expect(second.value?.projectId).not.toBe(first.value?.projectId);
    const rows = await getProjectsOfBoard(board.nodeId);
    expect(
      rows.map((row) => ({
        clientId: row.clientId,
        isFrozen: row.unlinkedAt !== null,
      })),
    ).toEqual([
      { clientId: firstClientId, isFrozen: true },
      { clientId: secondClientId, isFrozen: false },
    ]);
  });

  it("refuses a linked board, an archived or unknown Client, and a board outside the pool", async () => {
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const board = await seedPoolBoard(pmSource);
    const free = await seedPoolBoard(pmSource);
    await sync.link({
      boardNodeId: board.nodeId,
      clientId: await seedClient(),
      mapping: {},
      options: [],
    });
    const archivedClientId = await seedClient({ isArchived: true });

    const results = {
      linked: await sync.link({
        boardNodeId: board.nodeId,
        clientId: await seedClient(),
        mapping: {},
        options: [],
      }),
      archived: await sync.link({
        boardNodeId: free.nodeId,
        clientId: archivedClientId,
        mapping: {},
        options: [],
      }),
      unknown: await sync.link({
        boardNodeId: free.nodeId,
        clientId: randomUUID(),
        mapping: {},
        options: [],
      }),
      malformed: await sync.link({
        boardNodeId: free.nodeId,
        clientId: "not-a-uuid",
        mapping: {},
        options: [],
      }),
      outside: await sync.link({
        boardNodeId: `PVT_${randomUUID()}`,
        clientId: await seedClient(),
        mapping: {},
        options: [],
      }),
      off: await createSync(null).link({
        boardNodeId: free.nodeId,
        clientId: await seedClient(),
        mapping: {},
        options: [],
      }),
    };

    expect(results.linked).toMatchObject({
      error: "already-linked",
      status: 409,
    });
    expect(results.archived).toMatchObject({ error: "archived", status: 409 });
    expect(results.unknown).toMatchObject({
      error: "client-not-found",
      status: 404,
    });
    expect(results.malformed).toMatchObject({ error: "client-not-found" });
    expect(results.outside).toMatchObject({ error: "not-found", status: 404 });
    expect(results.off).toMatchObject({ error: "github-off", status: 503 });
    expect(await getProjectsOfBoard(free.nodeId)).toEqual([]);
  });

  it("keeps the board linked when the first sync fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pmSource = new FakePmSource();
    const board = await seedPoolBoard(pmSource);
    pmSource.setBoard(board.nodeId, new PmSourceError("GitHub is down"));

    const result = await createSync(pmSource).link({
      boardNodeId: board.nodeId,
      clientId: await seedClient(),
      mapping: {},
      options: [],
    });

    expect(result).toMatchObject({
      error: null,
      value: { firstSyncFailed: true },
    });
    expect(await getProject(result.value?.projectId ?? "")).toMatchObject({
      unlinkedAt: null,
      lastSyncedAt: null,
      lastSyncError: "GitHub is down",
    });
  });
});

describe("listProjects", () => {
  it("returns each Project's state and unmapped count, linked before unlinked, by name", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pmSource = new FakePmSource();
    const sync = createSync(pmSource);
    const clientId = await seedClient();
    const todo = buildStatusOption("Todo");
    const doing = buildStatusOption("Doing");
    const done = buildStatusOption("Done");
    const beta = await seedPoolBoard(pmSource, {
      title: "beta",
      statusOptions: [todo, doing, done],
    });
    const alpha = await seedPoolBoard(pmSource, {
      title: "Alpha",
      closed: true,
    });
    const archive = await seedPoolBoard(pmSource, { title: "Archive" });
    const failing = await seedPoolBoard(pmSource, { title: "Charlie" });
    pmSource.setBoard(failing.nodeId, new PmSourceError("Rate limited"));
    const ids = {
      beta: await sync.link({
        boardNodeId: beta.nodeId,
        clientId,
        mapping: { [done.id]: "DONE" },
        options: [todo, doing, done],
      }),
      alpha: await sync.link({
        boardNodeId: alpha.nodeId,
        clientId,
        mapping: {},
        options: [],
      }),
      archive: await sync.link({
        boardNodeId: archive.nodeId,
        clientId,
        mapping: {},
        options: [],
      }),
      charlie: await sync.link({
        boardNodeId: failing.nodeId,
        clientId,
        mapping: {},
        options: [],
      }),
    };
    await unlinkProject(ids.archive.value?.projectId ?? "");

    const rows = await sync.listProjects(clientId);

    expect(
      rows.map(({ name, state, unmappedCount, lastSyncError }) => ({
        name,
        state,
        unmappedCount,
        lastSyncError,
      })),
    ).toEqual([
      {
        name: "Alpha",
        state: "closed-on-github",
        unmappedCount: 0,
        lastSyncError: null,
      },
      { name: "beta", state: "linked", unmappedCount: 2, lastSyncError: null },
      {
        name: failing.title,
        state: "linked",
        unmappedCount: 0,
        lastSyncError: "Rate limited",
      },
      {
        name: "Archive",
        state: "unlinked",
        unmappedCount: 0,
        lastSyncError: null,
      },
    ]);
    expect(rows[0]).toMatchObject({
      id: ids.alpha.value?.projectId,
      url: alpha.url,
      unlinkedAt: null,
      lastSyncedAt: NOW,
    });
    expect(rows[3].unlinkedAt).toEqual(NOW);
  });

  it("is empty for an unknown or malformed Client", async () => {
    const sync = createSync();
    expect(await sync.listProjects(randomUUID())).toEqual([]);
    expect(await sync.listProjects("nope")).toEqual([]);
  });
});
