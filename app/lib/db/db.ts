import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/lib/db/schema";

// Fail fast when the database is unreachable instead of hanging a request.
const CONNECTION_TIMEOUT_MS = 5_000;
// The client-side backstop fires this long after the server-side limit, so a
// responsive server cancels first and its connection stays reusable.
const CLIENT_TIMEOUT_GRACE_MS = 1_000;
// pg's error for a query_timeout. The connection is still mid-query, so it
// must be destroyed, never returned to the pool.
const QUERY_READ_TIMEOUT_MESSAGE = "Query read timeout";
// Shape check only (any version, including the nil UUID): it guards against
// passing the wrong value, not against forged ids.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Db = {
  withTenant<T>(clientId: string, work: (tx: Tx) => Promise<T>): Promise<T>;
  withSystem<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type DbConfig = {
  tenantUrl: string;
  systemUrl: string;
  // Upper bound for every query on both pools. Migrations don't use these
  // pools, so they aren't bound by it.
  queryTimeoutMs: number;
};
type DbPools = {
  tenantPool: pg.Pool;
  systemPool: pg.Pool;
  queryTimeoutMs: number;
};

export function createDb(config: DbConfig): Db {
  return createDbFromPools({
    tenantPool: createPool(config.tenantUrl, config.queryTimeoutMs),
    systemPool: createPool(config.systemUrl, config.queryTimeoutMs),
    queryTimeoutMs: config.queryTimeoutMs,
  });
}

// Internal seam: tests pass pools they can inspect (e.g. a single-connection
// tenant pool). App code uses createDb.
export function createDbFromPools(pools: DbPools): Db {
  // Server-side limit, set per transaction rather than as a startup parameter,
  // which transaction-mode poolers (Neon's PgBouncer) may reject. Postgres
  // cancels the statement and the connection stays usable.
  const statementTimeout = String(pools.queryTimeoutMs);

  return {
    withTenant: async (clientId, work) => {
      // A programmer error, so it throws rather than returning a Result.
      if (!UUID_PATTERN.test(clientId)) {
        throw new Error("withTenant: clientId must be a UUID");
      }

      return runTransaction(
        pools.tenantPool,
        { statement_timeout: statementTimeout, "app.client_id": clientId },
        work,
      );
    },
    // The system pool logs in as app_system (BYPASSRLS): choosing this pool is
    // the only way to bypass RLS. There is no flag for it.
    withSystem: (work) =>
      runTransaction(
        pools.systemPool,
        { statement_timeout: statementTimeout },
        work,
      ),
    close: async () => {
      await Promise.all([pools.tenantPool.end(), pools.systemPool.end()]);
    },
  };
}

// Runs work in one transaction with `settings` applied transaction-locally
// (one round trip), so they end with it and never leak to the next user of
// the connection. The client is checked out here rather than by Drizzle, so
// one that hit pg's read timeout is destroyed instead of going back to the
// pool with a stuck socket.
async function runTransaction<T>(
  pool: pg.Pool,
  settings: Record<string, string>,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const setConfigs = Object.entries(settings).map(
    ([name, value]) => sql`set_config(${name}, ${value}, true)`,
  );
  const client = await pool.connect();
  let isReleased = false;
  let isEnded = false;
  let pendingQueries = 0;
  let timeoutError: unknown = null;
  // Passing an error makes the pool destroy the client.
  const release = (error?: Error): void => {
    if (isReleased) return;
    isReleased = true;
    client.release(error);
  };

  // Drizzle gets this per-checkout handle, never the pooled client, so a `tx`
  // that escapes `work` can't run a query inside a later checkout's
  // transaction (another Client's app.client_id). It also watches every query
  // (begin, commit, rollback and savepoints included): on a read timeout it
  // destroys the client at once, so whatever Drizzle queued behind the stuck
  // query fails fast instead of waiting out its own timeout.
  const scopedQuery = (...args: Parameters<typeof client.query>): unknown => {
    if (isEnded) {
      return Promise.reject(
        new Error("runTransaction: tx used after its transaction ended"),
      );
    }

    pendingQueries += 1;
    const result: unknown = client.query(...args);
    if (result instanceof Promise) {
      result.then(
        () => {
          pendingQueries -= 1;
        },
        (error: unknown) => {
          pendingQueries -= 1;
          if (!isReadTimeout(error)) return;
          timeoutError ??= error;
          release(toError(error));
        },
      );
    }
    return result;
  };
  // Drizzle only ever calls `query` on a non-pool client (its promise form),
  // which scopedQuery forwards unchanged.
  const scopedClient = { query: scopedQuery } as unknown as pg.PoolClient;

  try {
    return await drizzle({ client: scopedClient, schema }).transaction(
      async (tx) => {
        await tx.execute(sql`select ${sql.join(setConfigs, sql`, `)}`);
        return work(tx);
      },
    );
  } catch (error) {
    // The rollback's own "client closed" error would hide the real cause.
    throw timeoutError ?? error;
  } finally {
    isEnded = true;
    // Never pool a client still inside a transaction (its tenant settings and
    // uncommitted writes would reach the next caller), or one still running a
    // query that work fired without awaiting while the commit was in flight.
    const isClean =
      client.getTransactionStatus() === "I" && pendingQueries === 0;
    release(
      isClean
        ? undefined
        : new Error("runTransaction: client not clean at release"),
    );
  }
}

// Drizzle wraps the pg error in `cause`.
function isReadTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const source = error.cause instanceof Error ? error.cause : error;
  return source.message === QUERY_READ_TIMEOUT_MESSAGE;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createPool(connectionString: string, queryTimeoutMs: number): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // No statement_timeout here: Neon's PgBouncer (transaction mode) rejects
    // it as a startup parameter, so runTransaction sets it per transaction.
    // Client-side backstop for a server or network that stops answering.
    query_timeout: queryTimeoutMs + CLIENT_TIMEOUT_GRACE_MS,
  });
  // An idle client lost its connection (Neon restart, pooler recycle). The
  // pool has already evicted it and the next checkout opens a new one; with
  // no listener Node would crash the process. Message only: the error object
  // carries the client, password included.
  pool.on("error", (error) => {
    console.error(`db pool: idle client error: ${error.message}`);
  });
  return pool;
}
