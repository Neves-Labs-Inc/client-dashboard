import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createBoardSync } from "@/lib/board-sync/board-sync";
import { SYNC_STALE_AFTER_MS } from "@/lib/board-sync/sync-problem";
import { createDb } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { deleteClients, insertClients } from "../../support/clients";

const NOW = new Date("2026-10-16T12:00:00Z");
const FRESH = new Date(NOW.getTime() - 60 * 60 * 1000);
const STALE = new Date(NOW.getTime() - SYNC_STALE_AFTER_MS - 1000);

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const sync = createBoardSync({ db, pmSource: null, now: () => NOW });
const createdClientIds: string[] = [];

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await owner.query("delete from projects where client_id = any($1)", [
      createdClientIds,
    ]);
    await deleteClients(owner, createdClientIds);
  } finally {
    await owner.end();
    await db.close();
  }
});

type BoardState = {
  lastSyncedAt: Date | null;
  lastSyncError?: string | null;
  unlinkedAt?: Date | null;
};

// A new Client with one Project in `state`; archived Clients are set as the
// owner, since app_system can't update clients.
async function addClient(
  state: BoardState,
  isArchived = false,
): Promise<string> {
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    await tx.insert(projects).values({
      clientId,
      githubProjectNodeId: `PVT_${randomUUID()}`,
      githubProjectNumber: 7,
      name: "Website",
      url: "https://github.com/orgs/neves-labs/projects/7",
      ...state,
    });
  });
  if (isArchived) {
    const owner = new pg.Client({
      connectionString: getMigrateEnv().DATABASE_URL_OWNER,
    });
    await owner.connect();
    try {
      await owner.query(
        "update clients set archived_at = now() where id = $1",
        [clientId],
      );
    } finally {
      await owner.end();
    }
  }
  return clientId;
}

describe("listSyncProblemClientIds", () => {
  it("lists the active Clients with a stale or failing linked board", async () => {
    const stale = await addClient({ lastSyncedAt: STALE });
    const errored = await addClient({
      lastSyncedAt: FRESH,
      lastSyncError: "rate limit",
    });
    const neverSynced = await addClient({ lastSyncedAt: null });
    const healthy = await addClient({ lastSyncedAt: FRESH });
    const unlinkedErrored = await addClient({
      lastSyncedAt: STALE,
      lastSyncError: "rate limit",
      unlinkedAt: FRESH,
    });
    const archivedStale = await addClient({ lastSyncedAt: STALE }, true);

    const ids = await sync.listSyncProblemClientIds();

    expect(ids).toEqual(expect.arrayContaining([stale, errored, neverSynced]));
    expect(ids).not.toContain(healthy);
    expect(ids).not.toContain(unlinkedErrored);
    expect(ids).not.toContain(archivedStale);
  });
});
