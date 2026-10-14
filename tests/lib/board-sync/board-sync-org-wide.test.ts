import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  createBoardSync,
  RECONCILE_LOCK_KEY,
} from "@/lib/board-sync/board-sync";
import { createDb } from "@/lib/db/db";
import { clients, githubBoards, projects } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { PmSourceError } from "@/lib/pm-source/pm-source";
import { insertProject } from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import { buildBoard, FakePmSource, toSummary } from "../../support/pm-board";

// refreshPool deletes every pool row GitHub no longer lists, and reconcile
// syncs every linked Project, so this file runs after all the others
// (vitest.config.ts).

const NOW = new Date("2026-10-14T15:00:00Z");
const EARLIER = new Date("2026-10-01T00:00:00Z");

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const createdClientIds: string[] = [];
const createdBoardIds: string[] = [];
const ownerUrl = getMigrateEnv().DATABASE_URL_OWNER;

// Each reconcile sees only its own test's Projects.
afterEach(async () => {
  vi.restoreAllMocks();
  await db.withSystem((tx) =>
    tx
      .update(projects)
      .set({ unlinkedAt: NOW })
      .where(inArray(projects.clientId, createdClientIds)),
  );
});

afterAll(async () => {
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
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

function createSync(pmSource: FakePmSource) {
  return createBoardSync({ db, pmSource, now: () => NOW });
}

type Seeded = { projectId: string; nodeId: string };

async function seedProject(
  options: { isArchived?: boolean; isUnlinked?: boolean } = {},
): Promise<Seeded> {
  const clientId = randomUUID();
  const nodeId = `PVT_${randomUUID()}`;
  createdClientIds.push(clientId);
  const projectId = await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    if (options.isArchived) {
      await tx
        .update(clients)
        .set({ archivedAt: NOW })
        .where(eq(clients.id, clientId));
    }
    return insertProject(tx, {
      clientId,
      githubProjectNodeId: nodeId,
      unlinkedAt: options.isUnlinked ? NOW : null,
    });
  });
  return { projectId, nodeId };
}

function buildPoolRow(nodeId: string, title: string) {
  createdBoardIds.push(nodeId);
  return {
    nodeId,
    number: 3,
    title,
    url: "https://github.com/orgs/neves-labs/projects/3",
    closed: false,
    githubUpdatedAt: EARLIER,
    refreshedAt: EARLIER,
  };
}

function getPool() {
  return db.withSystem((tx) =>
    tx.select().from(githubBoards).orderBy(githubBoards.title),
  );
}

function getProjectRow(projectId: string) {
  return db.withSystem(async (tx) => {
    const [row] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    return row;
  });
}

// Boards of linked Projects this file didn't seed (left by an aborted run of
// another suite). The fake answers null for them, so each counts as synced.
function getOtherCalls(pmSource: FakePmSource, seeded: Seeded[]): string[] {
  const ownNodeIds = seeded.map(({ nodeId }) => nodeId);
  return pmSource.getBoardCalls.filter(
    (nodeId) => !ownNodeIds.includes(nodeId),
  );
}

describe("refreshPool", () => {
  it("upserts every listed board and deletes the ones GitHub no longer has", async () => {
    const kept = buildBoard({ title: "Kept, renamed", closed: true });
    const added = buildBoard({ title: "Added" });
    createdBoardIds.push(added.nodeId);
    await db.withSystem((tx) =>
      tx
        .insert(githubBoards)
        .values([
          buildPoolRow(kept.nodeId, "Kept"),
          buildPoolRow(`PVT_${randomUUID()}`, "Deleted on GitHub"),
        ]),
    );
    const pmSource = new FakePmSource();
    pmSource.boardSummaries = [toSummary(kept), toSummary(added)];

    await createSync(pmSource).refreshPool();

    expect(await getPool()).toEqual([
      {
        nodeId: added.nodeId,
        number: added.number,
        title: "Added",
        url: added.url,
        closed: false,
        githubUpdatedAt: added.updatedAt,
        refreshedAt: NOW,
      },
      {
        nodeId: kept.nodeId,
        number: kept.number,
        title: "Kept, renamed",
        url: kept.url,
        closed: true,
        githubUpdatedAt: kept.updatedAt,
        refreshedAt: NOW,
      },
    ]);
  });
});

describe("reconcile", () => {
  it("refreshes the pool and syncs every eligible Project, counting failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const healthy = await seedProject();
    const failing = await seedProject();
    const archived = await seedProject({ isArchived: true });
    const unlinked = await seedProject({ isUnlinked: true });
    const pmSource = new FakePmSource();
    const healthyBoard = buildBoard({ nodeId: healthy.nodeId });
    createdBoardIds.push(healthy.nodeId);
    pmSource.boardSummaries = [toSummary(healthyBoard)];
    pmSource.setBoard(healthy.nodeId, healthyBoard);
    pmSource.setBoard(failing.nodeId, new PmSourceError("GitHub is down"));
    pmSource.setBoard(archived.nodeId, buildBoard({ nodeId: archived.nodeId }));
    pmSource.setBoard(unlinked.nodeId, buildBoard({ nodeId: unlinked.nodeId }));

    const result = await createSync(pmSource).reconcile();

    const otherCalls = getOtherCalls(pmSource, [healthy, failing]);
    expect(result).toEqual({
      skipped: false,
      synced: 1 + otherCalls.length,
      failed: 1,
    });
    expect(pmSource.getBoardCalls).toEqual(
      expect.arrayContaining([healthy.nodeId, failing.nodeId]),
    );
    expect(pmSource.getBoardCalls).not.toContain(archived.nodeId);
    expect(pmSource.getBoardCalls).not.toContain(unlinked.nodeId);
    expect((await getProjectRow(healthy.projectId)).lastSyncedAt).toEqual(NOW);
    expect((await getProjectRow(failing.projectId)).lastSyncError).toBe(
      "GitHub is down",
    );
    expect((await getPool()).map((row) => row.nodeId)).toEqual([
      healthy.nodeId,
    ]);
  });

  it("still syncs the boards when the pool refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seeded = await seedProject();
    const pmSource = new FakePmSource();
    pmSource.listBoardsError = new PmSourceError("GitHub is down");
    pmSource.setBoard(seeded.nodeId, buildBoard({ nodeId: seeded.nodeId }));

    const result = await createSync(pmSource).reconcile();

    const otherCalls = getOtherCalls(pmSource, [seeded]);
    expect(pmSource.getBoardCalls).toContain(seeded.nodeId);
    expect(result).toEqual({
      skipped: false,
      synced: 1 + otherCalls.length,
      failed: 0,
    });
    expect(console.error).toHaveBeenCalledWith(
      "board-sync: reconcile pool refresh failed: PmSourceError",
    );
  });

  it("skips while another transaction holds the reconcile lock", async () => {
    const seeded = await seedProject();
    const pmSource = new FakePmSource();
    pmSource.setBoard(seeded.nodeId, buildBoard({ nodeId: seeded.nodeId }));
    const holder = new pg.Client({ connectionString: ownerUrl });
    await holder.connect();
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock($1)", [
        String(RECONCILE_LOCK_KEY),
      ]);

      const result = await createSync(pmSource).reconcile();

      expect(result).toEqual({ skipped: true, synced: 0, failed: 0 });
      expect(pmSource.getBoardCalls).toEqual([]);
    } finally {
      await holder.query("rollback");
      await holder.end();
    }
  });
});
