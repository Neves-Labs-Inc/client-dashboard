import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "@/lib/db/db";
import { clients } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { getPgError } from "../../support/pg-error";

const INSUFFICIENT_PRIVILEGE = "42501";

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const createdIds: string[] = [];

afterAll(async () => {
  // app_system can't DELETE from clients, so the owner cleans up.
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await owner.query("delete from clients where id = any($1::uuid[])", [
      createdIds,
    ]);
  } finally {
    await owner.end();
    await db.close();
  }
});

describe("clients as app_system", () => {
  it("inserts and reads back Clients for any Client id", async () => {
    const ids = [randomUUID(), randomUUID()];
    createdIds.push(...ids);

    const rows = await db.withSystem(async (tx) => {
      await tx.insert(clients).values(ids.map((id) => ({ id })));
      return tx.select().from(clients).where(inArray(clients.id, ids));
    });

    expect(rows.map((row) => row.id).sort()).toEqual([...ids].sort());
    expect(rows.every((row) => row.archivedAt === null)).toBe(true);
    expect(rows.every((row) => row.createdAt instanceof Date)).toBe(true);
  });

  it("archives a Client by setting archived_at", async () => {
    const id = randomUUID();
    createdIds.push(id);
    const archivedAt = new Date("2026-01-02T03:04:05Z");

    const row = await db.withSystem(async (tx) => {
      await tx.insert(clients).values({ id });
      const [updated] = await tx
        .update(clients)
        .set({ archivedAt })
        .where(eq(clients.id, id))
        .returning();
      return updated;
    });

    expect(row.archivedAt).toEqual(archivedAt);
  });

  it("is refused when deleting a Client", async () => {
    const id = randomUUID();
    createdIds.push(id);
    await db.withSystem((tx) => tx.insert(clients).values({ id }));

    const run = db.withSystem((tx) =>
      tx.delete(clients).where(eq(clients.id, id)),
    );

    await expect(run.catch((error) => getPgError(error)?.code)).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

describe("clients as app_tenant", () => {
  it("is refused writing even its own Client: it may only read", async () => {
    const id = randomUUID();

    const run = db.withTenant(id, (tx) => tx.insert(clients).values({ id }));

    await expect(run.catch(getPgError)).resolves.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
      message: expect.stringMatching(/permission denied/),
    });
  });
});
