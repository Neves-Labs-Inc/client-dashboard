import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createDb, createDbFromPools, type Db, type Tx } from "@/lib/db/db";
import { clients } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { deleteClients, insertClients } from "../../support/clients";
import { getPgError } from "../../support/pg-error";

const CLIENT_A = "6f1c2a3e-8b4d-4c5e-9f70-1a2b3c4d5e6f";
const USER_A = "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});

afterAll(async () => {
  await db.close();
});

// A Db whose pools each hold a single connection, so the test knows which
// connection every call lands on and can query it outside the data module.
function createSingleConnectionDb(): { db: Db; tenantPool: pg.Pool } {
  const tenantPool = new pg.Pool({
    connectionString: env.DATABASE_URL_TENANT,
    max: 1,
  });
  const systemPool = new pg.Pool({
    connectionString: env.DATABASE_URL_SYSTEM,
    max: 1,
  });
  const singleConnectionDb = createDbFromPools({
    tenantPool,
    systemPool,
    queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
  });
  return { db: singleConnectionDb, tenantPool };
}

async function readSetting(
  pool: pg.Pool,
  name: string,
): Promise<string | null> {
  const result = await pool.query<{ value: string | null }>(
    "select current_setting($1, true) as value",
    [name],
  );
  return result.rows[0].value;
}

describe("withTenant", () => {
  it("runs work as app_tenant with app.client_id set to the client", async () => {
    const row = await db.withTenant(CLIENT_A, async (tx) => {
      const result = await tx.execute<{ clientId: string; user: string }>(
        sql`select current_setting('app.client_id', true) as "clientId",
            current_user as "user"`,
      );
      return result.rows[0];
    });

    expect(row).toEqual({ clientId: CLIENT_A, user: "app_tenant" });
  });

  it("leaves no app.client_id on the connection once the transaction ends", async () => {
    const { db: singleDb, tenantPool } = createSingleConnectionDb();
    try {
      const pidInside = await singleDb.withTenant(CLIENT_A, async (tx) => {
        const result = await tx.execute<{ pid: number }>(
          sql`select pg_backend_pid() as pid`,
        );
        return result.rows[0].pid;
      });
      const pidAfter = await tenantPool.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      );

      expect(pidAfter.rows[0].pid).toBe(pidInside);
      // Postgres reports a never-set custom GUC as null and a reset one as "".
      expect(await readSetting(tenantPool, "app.client_id")).toBeOneOf([
        null,
        "",
      ]);
    } finally {
      await singleDb.close();
    }
  });

  it("rolls back what work wrote and rethrows when work throws", async () => {
    const { db: singleDb, tenantPool } = createSingleConnectionDb();
    const failure = new Error("work failed");
    try {
      const run = singleDb.withTenant(CLIENT_A, async (tx) => {
        // Session-level (not local) write: only a rollback can undo it.
        await tx.execute(sql`select set_config('app.probe', 'written', false)`);
        throw failure;
      });

      await expect(run).rejects.toBe(failure);
      expect(await readSetting(tenantPool, "app.probe")).toBeOneOf([null, ""]);
    } finally {
      await singleDb.close();
    }
  });

  it("rejects a clientId that isn't a UUID without opening a connection", async () => {
    const { db: singleDb, tenantPool } = createSingleConnectionDb();
    try {
      const run = singleDb.withTenant("client-a", async () => "ran");

      await expect(run).rejects.toThrow(/uuid/i);
      expect(tenantPool.totalCount).toBe(0);
    } finally {
      await singleDb.close();
    }
  });

  it("sets app.user_id to the given userId", async () => {
    const userId = await db.withTenant(
      CLIENT_A,
      async (tx) => {
        const result = await tx.execute<{ userId: string }>(
          sql`select current_setting('app.user_id', true) as "userId"`,
        );
        return result.rows[0].userId;
      },
      { userId: USER_A },
    );

    expect(userId).toBe(USER_A);
  });

  it("leaves app.user_id unset when no userId is given", async () => {
    const { db: singleDb } = createSingleConnectionDb();
    try {
      const userId = await singleDb.withTenant(CLIENT_A, async (tx) => {
        const result = await tx.execute<{ userId: string | null }>(
          sql`select current_setting('app.user_id', true) as "userId"`,
        );
        return result.rows[0].userId;
      });

      expect(userId).toBeOneOf([null, ""]);
    } finally {
      await singleDb.close();
    }
  });

  it("leaves no app.user_id for the next checkout of the connection", async () => {
    const { db: singleDb, tenantPool } = createSingleConnectionDb();
    try {
      await singleDb.withTenant(CLIENT_A, async () => null, {
        userId: USER_A,
      });
      const nextUserId = await singleDb.withTenant(CLIENT_A, async (tx) => {
        const result = await tx.execute<{ userId: string | null }>(
          sql`select current_setting('app.user_id', true) as "userId"`,
        );
        return result.rows[0].userId;
      });

      expect(nextUserId).toBeOneOf([null, ""]);
      expect(await readSetting(tenantPool, "app.user_id")).toBeOneOf([
        null,
        "",
      ]);
    } finally {
      await singleDb.close();
    }
  });

  it("rejects a userId that isn't a UUID without opening a connection", async () => {
    const { db: singleDb, tenantPool } = createSingleConnectionDb();
    try {
      const run = singleDb.withTenant(CLIENT_A, async () => "ran", {
        userId: "user-a",
      });

      await expect(run).rejects.toThrow(/uuid/i);
      expect(tenantPool.totalCount).toBe(0);
    } finally {
      await singleDb.close();
    }
  });
});

describe("withSystem", () => {
  it("runs work as app_system", async () => {
    const user = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ user: string }>(
        sql`select current_user as "user"`,
      );
      return result.rows[0].user;
    });

    expect(user).toBe("app_system");
  });
});

describe("pools", () => {
  it("survives an idle connection being dropped and serves the next query", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const ownDb = createDb({
      tenantUrl: env.DATABASE_URL_TENANT,
      systemUrl: env.DATABASE_URL_SYSTEM,
      queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
    });
    // Same role, so it may terminate the pooled backend (as a Neon restart or
    // pooler recycle would).
    const killer = new pg.Client({ connectionString: env.DATABASE_URL_TENANT });
    await killer.connect();
    try {
      const idlePid = await ownDb.withTenant(CLIENT_A, async (tx) => {
        const result = await tx.execute<{ pid: number }>(
          sql`select pg_backend_pid() as pid`,
        );
        return result.rows[0].pid;
      });

      await killer.query("select pg_terminate_backend($1)", [idlePid]);
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

      const nextPid = await ownDb.withTenant(CLIENT_A, async (tx) => {
        const result = await tx.execute<{ pid: number }>(
          sql`select pg_backend_pid() as pid`,
        );
        return result.rows[0].pid;
      });
      expect(nextPid).not.toBe(idlePid);
    } finally {
      consoleError.mockRestore();
      await killer.end();
      await ownDb.close();
    }
  });
});

describe("query time limit", () => {
  const QUERY_TIMEOUT_MS = 300;
  const QUERY_CANCELED = "57014";

  function createLimitedDb(): Db {
    return createDb({
      tenantUrl: env.DATABASE_URL_TENANT,
      systemUrl: env.DATABASE_URL_SYSTEM,
      queryTimeoutMs: QUERY_TIMEOUT_MS,
    });
  }

  async function readBackendPid(tx: Tx): Promise<number> {
    const result = await tx.execute<{ pid: number }>(
      sql`select pg_backend_pid() as pid`,
    );
    return result.rows[0].pid;
  }

  it("cancels a query that runs past the limit, then serves the next one", async () => {
    const limitedDb = createLimitedDb();
    try {
      const run = limitedDb.withTenant(CLIENT_A, (tx) =>
        tx.execute(sql`select pg_sleep(5)`),
      );

      const error = await run.catch((caught: unknown) => caught);
      expect(getPgError(error)?.code).toBe(QUERY_CANCELED);
      expect(await limitedDb.withSystem(readBackendPid)).toBeGreaterThan(0);
      expect(
        await limitedDb.withTenant(CLIENT_A, readBackendPid),
      ).toBeGreaterThan(0);
    } finally {
      await limitedDb.close();
    }
  });

  it("gives up on a server that stops answering and drops that connection", async () => {
    const limitedDb = createLimitedDb();
    const killer = new pg.Client({ connectionString: env.DATABASE_URL_TENANT });
    await killer.connect();
    let stuckPid = 0;
    try {
      const startedAt = Date.now();
      // statement_timeout off for this transaction: the server never cancels,
      // as when it is frozen or the network goes silent.
      const run = limitedDb.withTenant(CLIENT_A, async (tx) => {
        stuckPid = await readBackendPid(tx);
        await tx.execute(sql`set local statement_timeout = 0`);
        await tx.execute(sql`select pg_sleep(30)`);
      });

      await expect(run).rejects.toThrow(/timeout/i);
      // Bounded by the client-side limit, not doubled by a rollback that
      // waits on the same stuck connection.
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      const nextPid = await limitedDb.withTenant(CLIENT_A, readBackendPid);
      expect(nextPid).not.toBe(stuckPid);
    } finally {
      await killer.query("select pg_terminate_backend($1)", [stuckPid]);
      await killer.end();
      await limitedDb.close();
    }
  });

  it("drops the connection without a second wait when the commit stops answering", async () => {
    const limitedDb = createLimitedDb();
    const killer = new pg.Client({ connectionString: env.DATABASE_URL_TENANT });
    await killer.connect();
    let stuckPid = 0;
    try {
      const startedAt = Date.now();
      // A deferred trigger runs at COMMIT, so work's own queries all answer
      // and only the commit hangs.
      const run = limitedDb.withTenant(CLIENT_A, async (tx) => {
        stuckPid = await readBackendPid(tx);
        await tx.execute(sql`set local statement_timeout = 0`);
        await tx.execute(sql`create temp table commit_probe (id int)`);
        await tx.execute(
          sql.raw(`create function pg_temp.stall() returns trigger
            language plpgsql as $$ begin perform pg_sleep(30); return null; end $$`),
        );
        await tx.execute(
          sql.raw(`create constraint trigger stall_on_commit
            after insert on commit_probe deferrable initially deferred
            for each row execute function pg_temp.stall()`),
        );
        await tx.execute(sql`insert into commit_probe values (1)`);
      });

      await expect(run).rejects.toThrow(/timeout/i);
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      const nextPid = await limitedDb.withTenant(CLIENT_A, readBackendPid);
      expect(nextPid).not.toBe(stuckPid);
    } finally {
      await killer.query("select pg_terminate_backend($1)", [stuckPid]);
      await killer.end();
      await limitedDb.close();
    }
  });
});

describe("a tx used after its transaction ended", () => {
  const CLIENT_B = randomUUID();
  const lateInsertId = randomUUID();

  afterAll(async () => {
    const owner = new pg.Client({
      connectionString: getMigrateEnv().DATABASE_URL_OWNER,
    });
    await owner.connect();
    try {
      await deleteClients(owner, [CLIENT_B, lateInsertId]);
    } finally {
      await owner.end();
    }
  });

  it("refuses a stored tenant tx instead of running it in the next Client's transaction", async () => {
    await db.withSystem((tx) => insertClients(tx, [CLIENT_B]));
    const { db: singleDb } = createSingleConnectionDb();
    try {
      const leaked: { tx: Tx | null } = { tx: null };
      await singleDb.withTenant(CLIENT_A, async (tx) => {
        leaked.tx = tx;
      });

      // Client B now holds the pool's only connection.
      const lateResult = await singleDb.withTenant(CLIENT_B, async () => {
        if (!leaked.tx) throw new Error("tx was not captured");
        return leaked.tx
          .select()
          .from(clients)
          .where(eq(clients.id, CLIENT_B))
          .catch((caught: unknown) => caught);
      });

      // Drizzle wraps the refusal; it is the cause.
      expect(lateResult).toMatchObject({
        cause: { message: expect.stringMatching(/transaction ended/i) },
      });
    } finally {
      await singleDb.close();
    }
  });

  it("refuses a stored system tx instead of writing in the next transaction", async () => {
    const { db: singleDb } = createSingleConnectionDb();
    try {
      const leaked: { tx: Tx | null } = { tx: null };
      await singleDb.withSystem(async (tx) => {
        leaked.tx = tx;
      });

      // The next system transaction holds the only connection and commits.
      const lateResult = await singleDb.withSystem(async () => {
        if (!leaked.tx) throw new Error("tx was not captured");
        return leaked.tx
          .insert(clients)
          .values({ id: lateInsertId })
          .catch((caught: unknown) => caught);
      });

      // Drizzle wraps the refusal; it is the cause.
      expect(lateResult).toMatchObject({
        cause: { message: expect.stringMatching(/transaction ended/i) },
      });
      const written = await db.withSystem((tx) =>
        tx.select().from(clients).where(eq(clients.id, lateInsertId)),
      );
      expect(written).toEqual([]);
    } finally {
      await singleDb.close();
    }
  });
});
