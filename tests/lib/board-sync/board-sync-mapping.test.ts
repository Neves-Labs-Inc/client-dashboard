import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  createBoardSync,
  getClientStatus,
  type ClientStatus,
} from "@/lib/board-sync/board-sync";
import { createDb } from "@/lib/db/db";
import { clients, githubBoards, projects } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import type { PmBoard, PmStatusOption } from "@/lib/pm-source/pm-source";
import { deleteClients, insertClients } from "../../support/clients";
import {
  buildBoard,
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

async function seedClient(isArchived = false): Promise<string> {
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    if (isArchived) {
      await tx
        .update(clients)
        .set({ archivedAt: NOW })
        .where(eq(clients.id, clientId));
    }
  });
  return clientId;
}

type LinkedBoard = {
  sync: ReturnType<typeof createBoardSync>;
  clientId: string;
  projectId: string;
  board: PmBoard;
};

// A board linked to a new Client with `mapping`, as the Link drawer does.
async function linkBoard(
  statusOptions: PmStatusOption[],
  mapping: Record<string, ClientStatus | null> = {},
  overrides: Partial<PmBoard> = {},
): Promise<LinkedBoard> {
  const pmSource = new FakePmSource();
  const board = buildBoard({ statusOptions, ...overrides });
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
    mapping,
    options: statusOptions,
  });
  return { sync, clientId, projectId: linked.value?.projectId ?? "", board };
}

describe("getMapping", () => {
  it("lists the stored options by name with their client status", async () => {
    const qa = buildStatusOption("QA");
    const backlog = buildStatusOption("backlog");
    const review = buildStatusOption("In review");
    const { sync, projectId, board } = await linkBoard(
      [qa, backlog, review],
      { [backlog.id]: "UP_NEXT", [review.id]: "IN_PROGRESS" },
      { title: "Acme website" },
    );

    const mapping = await sync.getMapping(projectId);

    expect(mapping).toEqual({
      projectName: board.title,
      options: [
        { id: backlog.id, name: "backlog", clientStatus: "UP_NEXT" },
        { id: review.id, name: "In review", clientStatus: "IN_PROGRESS" },
        { id: qa.id, name: "QA", clientStatus: null },
      ],
    });
  });

  it("is null for an unknown or malformed Project id", async () => {
    const { sync } = await linkBoard([]);

    expect(await sync.getMapping(randomUUID())).toBeNull();
    expect(await sync.getMapping("not-a-uuid")).toBeNull();
  });

  it("lists no options for a board without a Status column", async () => {
    const { sync, projectId } = await linkBoard([]);

    expect((await sync.getMapping(projectId))?.options).toEqual([]);
  });
});

describe("saveMapping", () => {
  it("updates the statuses, and a Task's client status follows at once", async () => {
    const todo = buildStatusOption("Todo");
    const done = buildStatusOption("Done");
    const { sync, projectId } = await linkBoard([todo, done]);

    const saved = await sync.saveMapping(projectId, {
      [todo.id]: "UP_NEXT",
      [done.id]: "DONE",
    });

    expect(saved).toEqual({ value: null, error: null, status: 200 });
    const mapping = await sync.getMapping(projectId);
    const byOption = new Map(
      mapping?.options.map((option) => [option.id, option.clientStatus]),
    );
    expect(getClientStatus(todo.id, byOption)).toBe("UP_NEXT");
    expect(getClientStatus(done.id, byOption)).toBe("DONE");
  });

  it("can unmap an option again", async () => {
    const todo = buildStatusOption("Todo");
    const { sync, projectId } = await linkBoard([todo], {
      [todo.id]: "DONE",
    });

    await sync.saveMapping(projectId, { [todo.id]: null });

    expect((await sync.getMapping(projectId))?.options).toEqual([
      { id: todo.id, name: "Todo", clientStatus: null },
    ]);
  });

  it("ignores ids the Project has no option for, and leaves omitted options alone", async () => {
    const todo = buildStatusOption("Todo");
    const done = buildStatusOption("Done");
    const { sync, projectId } = await linkBoard([todo, done], {
      [done.id]: "DONE",
    });

    const saved = await sync.saveMapping(projectId, {
      [todo.id]: "UP_NEXT",
      PVTSSF_unknown: "DONE",
    });

    expect(saved.error).toBeNull();
    expect((await sync.getMapping(projectId))?.options).toEqual([
      { id: done.id, name: "Done", clientStatus: "DONE" },
      { id: todo.id, name: "Todo", clientStatus: "UP_NEXT" },
    ]);
  });

  it("refuses an unlinked Project and changes nothing", async () => {
    const todo = buildStatusOption("Todo");
    const { sync, projectId } = await linkBoard([todo]);
    await db.withSystem((tx) =>
      tx
        .update(projects)
        .set({ unlinkedAt: NOW })
        .where(eq(projects.id, projectId)),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const saved = await sync.saveMapping(projectId, { [todo.id]: "DONE" });

    expect(saved).toMatchObject({ error: "unlinked", status: 409 });
    expect((await sync.getMapping(projectId))?.options[0].clientStatus).toBe(
      null,
    );
  });

  it("refuses an archived Client's Project", async () => {
    const todo = buildStatusOption("Todo");
    const { sync, clientId, projectId } = await linkBoard([todo]);
    await db.withSystem((tx) =>
      tx
        .update(clients)
        .set({ archivedAt: NOW })
        .where(eq(clients.id, clientId)),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const saved = await sync.saveMapping(projectId, { [todo.id]: "DONE" });

    expect(saved).toMatchObject({ error: "archived", status: 409 });
    expect((await sync.getMapping(projectId))?.options[0].clientStatus).toBe(
      null,
    );
  });

  it("refuses an unknown or malformed Project id", async () => {
    const { sync } = await linkBoard([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await sync.saveMapping(randomUUID(), {})).toMatchObject({
      error: "not-found",
      status: 404,
    });
    expect(await sync.saveMapping("not-a-uuid", {})).toMatchObject({
      error: "not-found",
      status: 404,
    });
  });
});
