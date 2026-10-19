import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  createBoardSync,
  type BoardSync,
  type ClientStatus,
} from "@/lib/board-sync/board-sync";
import { createDb } from "@/lib/db/db";
import { clients, githubBoards } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { PmSourceError, type PmBoard } from "@/lib/pm-source/pm-source";
import { deleteClients, insertClients } from "../../support/clients";
import {
  buildBoard,
  buildIssue,
  buildStatusOption,
  buildStatusUpdate,
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

type LinkedBoard = {
  sync: BoardSync;
  pmSource: FakePmSource;
  clientId: string;
  projectId: string;
};

// A board linked to a new Client with `mapping`; the link's first sync reads
// `responses` (see FakePmSource.setBoard).
async function linkBoard(
  board: PmBoard,
  mapping: Record<string, ClientStatus | null> = {},
  ...responses: (PmBoard | Error)[]
): Promise<LinkedBoard> {
  const pmSource = new FakePmSource();
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
  pmSource.setBoard(
    board.nodeId,
    ...(responses.length > 0 ? responses : [board]),
  );
  const sync = createBoardSync({ db, pmSource, now: () => NOW });
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem((tx) => insertClients(tx, [clientId]));
  const linked = await sync.link({
    boardNodeId: board.nodeId,
    clientId,
    mapping,
    options: board.statusOptions,
  });
  return {
    sync,
    pmSource,
    clientId,
    projectId: linked.value?.projectId ?? "",
  };
}

describe("getBoardDetail", () => {
  it("reports every required field present after a sync", async () => {
    const { sync, clientId, projectId } = await linkBoard(buildBoard());

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail?.fieldChecks).toEqual([
      { field: "Client visibility", check: "present" },
      { field: "Client note", check: "present" },
      { field: "Target date", check: "present" },
    ]);
  });

  it("reports a field the board lacks as missing", async () => {
    const board = buildBoard({
      fields: {
        clientVisibility: "present",
        clientNote: "missing",
        targetDate: "present",
      },
    });
    const { sync, clientId, projectId } = await linkBoard(board);

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail?.fieldChecks).toEqual([
      { field: "Client visibility", check: "present" },
      { field: "Client note", check: "missing" },
      { field: "Target date", check: "present" },
    ]);
    expect(detail?.syncWarnings).toEqual([
      { kind: "missing-field", field: "Client note" },
    ]);
  });

  it("reports a field that is an issue field, stores its warning, and syncs no Task from it", async () => {
    const board = buildBoard({
      fields: {
        clientVisibility: "issue-field",
        clientNote: "missing",
        targetDate: "present",
      },
      // The adapter reads visibility as null: only project values count.
      items: [buildIssue({ title: "Hidden", visibility: null })],
    });
    const { sync, clientId, projectId } = await linkBoard(board);

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail?.fieldChecks).toEqual([
      { field: "Client visibility", check: "issue-field" },
      { field: "Client note", check: "missing" },
      { field: "Target date", check: "present" },
    ]);
    expect(detail?.syncWarnings).toEqual([
      { kind: "issue-field", field: "Client visibility" },
      { kind: "missing-field", field: "Client note" },
    ]);
    expect(detail?.tasks).toEqual([]);
  });

  it("doesn't flag a freshly synced board with an issue-field warning as a sync problem", async () => {
    const board = buildBoard({
      fields: {
        clientVisibility: "issue-field",
        clientNote: "present",
        targetDate: "present",
      },
    });
    const { sync, clientId } = await linkBoard(board);

    expect(await sync.listSyncProblemClientIds()).not.toContain(clientId);
  });

  it("checks no field on a board that has never synced", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = buildBoard();
    const { sync, clientId, projectId } = await linkBoard(
      board,
      {},
      new PmSourceError("Bad credentials"),
    );

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail).toMatchObject({
      lastSyncedAt: null,
      lastSyncError: "Bad credentials",
      fieldChecks: [
        { field: "Client visibility", check: "not-checked" },
        { field: "Client note", check: "not-checked" },
        { field: "Target date", check: "not-checked" },
      ],
    });
  });

  it("returns the board's facts, warnings and unmapped count", async () => {
    const todo = buildStatusOption("Todo");
    const review = buildStatusOption("In review");
    const qa = buildStatusOption("QA");
    const board = buildBoard({
      title: "Acme app",
      statusOptions: [todo, review, qa],
      items: [{ kind: "unreadable", itemNodeId: `PVTI_${randomUUID()}` }],
      statusUpdates: [
        buildStatusUpdate({
          health: "ON_TRACK",
          createdAt: new Date("2026-10-01T12:00:00Z"),
        }),
        buildStatusUpdate({
          health: "AT_RISK",
          createdAt: new Date("2026-10-08T12:00:00Z"),
        }),
      ],
    });
    const { sync, clientId, projectId } = await linkBoard(board, {
      [todo.id]: "UP_NEXT",
    });

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail).toMatchObject({
      id: projectId,
      name: "Acme app",
      url: board.url,
      state: "linked",
      unlinkedAt: null,
      isClientArchived: false,
      lastSyncedAt: NOW,
      lastSyncError: null,
      syncWarnings: [{ kind: "unreadable-items", count: 1 }],
      unmappedCount: 2,
      health: "AT_RISK",
    });
  });

  it("returns visible Tasks only, by Milestone then the Client's order, with option names", async () => {
    const todo = buildStatusOption("Todo");
    const review = buildStatusOption("In review");
    const shipped = buildStatusOption("Shipped");
    const beta = { title: "Beta", dueOn: "2026-11-14" };
    const alpha = { title: "Alpha", dueOn: "2026-10-30" };
    const issues = [
      buildIssue({ title: "Write docs", milestone: null }),
      buildIssue({
        title: "Fix login",
        milestone: beta,
        statusOptionId: review.id,
        targetDate: "2026-11-10",
      }),
      buildIssue({
        title: "Ship beta",
        milestone: beta,
        statusOptionId: shipped.id,
        closedAt: new Date("2026-10-10T12:00:00Z"),
      }),
      buildIssue({
        title: "Plan alpha",
        milestone: alpha,
        statusOptionId: todo.id,
      }),
      buildIssue({ title: "Secret work", visibility: "Internal" }),
    ];
    const board = buildBoard({
      statusOptions: [todo, review, shipped],
      items: issues,
    });
    const { sync, clientId, projectId } = await linkBoard(board, {
      [todo.id]: "UP_NEXT",
      [review.id]: "IN_PROGRESS",
      [shipped.id]: "DONE",
    });

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail?.tasks).toMatchObject([
      {
        title: "Plan alpha",
        clientStatus: "UP_NEXT",
        optionName: "Todo",
        milestoneTitle: "Alpha",
        targetDate: null,
      },
      {
        title: "Fix login",
        clientStatus: "IN_PROGRESS",
        optionName: "In review",
        milestoneTitle: "Beta",
        targetDate: "2026-11-10",
      },
      {
        title: "Ship beta",
        clientStatus: "DONE",
        optionName: "Shipped",
        milestoneTitle: "Beta",
        targetDate: null,
      },
      {
        title: "Write docs",
        clientStatus: "UP_NEXT",
        optionName: null,
        milestoneTitle: null,
        targetDate: null,
      },
    ]);
    expect(detail?.milestones).toMatchObject([
      {
        title: "Alpha",
        dueDate: "2026-10-30",
        progress: { done: 0, total: 1, percent: 0 },
      },
      {
        title: "Beta",
        dueDate: "2026-11-14",
        progress: { done: 1, total: 2, percent: 50 },
      },
    ]);
  });

  it("counts the Tasks hidden from the Client", async () => {
    const shown = buildIssue({ title: "Shown" });
    const hidden = buildIssue({ title: "Made internal" });
    const before = buildBoard({ items: [shown, hidden] });
    const after = {
      ...before,
      items: [shown, { ...hidden, visibility: "Internal" as const }],
    };
    const { sync, clientId, projectId } = await linkBoard(
      before,
      {},
      before,
      after,
    );
    await sync.syncNow(projectId);

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail?.hiddenCount).toBe(1);
    expect(detail?.tasks.map((task) => task.title)).toEqual(["Shown"]);
  });

  it("is null for another Client's Project and an unknown id", async () => {
    const { sync, projectId } = await linkBoard(buildBoard());
    const other = await linkBoard(buildBoard());

    expect(await sync.getBoardDetail(other.clientId, projectId)).toBeNull();
    expect(await sync.getBoardDetail(other.clientId, randomUUID())).toBeNull();
    expect(await sync.getBoardDetail(other.clientId, "not-a-uuid")).toBeNull();
  });

  it("flags an archived Client", async () => {
    const { sync, clientId, projectId } = await linkBoard(buildBoard());
    await db.withSystem((tx) =>
      tx
        .update(clients)
        .set({ archivedAt: NOW })
        .where(eq(clients.id, clientId)),
    );

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail?.isClientArchived).toBe(true);
  });

  it("reports a board closed on GitHub", async () => {
    const { sync, clientId, projectId } = await linkBoard(
      buildBoard({ closed: true }),
    );

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail).toMatchObject({
      state: "closed-on-github",
      unlinkedAt: null,
    });
  });

  it("reports an unlinked board with its date", async () => {
    const { sync, clientId, projectId } = await linkBoard(buildBoard());
    await sync.unlink(projectId);

    const detail = await sync.getBoardDetail(clientId, projectId);

    expect(detail).toMatchObject({ state: "unlinked", unlinkedAt: NOW });
  });
});
