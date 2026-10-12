import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/db";

// Touches no rows: the tenant check only needs a valid UUID to open its scope.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const NO_STORE = { "Cache-Control": "no-store" };
// The pool's connection timeout only covers connecting; a warm connection that
// stops answering would hang the request without this bound.
const DEFAULT_CHECK_TIMEOUT_MS = 5_000;

type PoolName = "tenant" | "system";

// One check per Db at a time: concurrent requests share it, so a flood of
// unauthenticated requests can't take a connection per pool per request.
const inFlight = new WeakMap<Db, Promise<boolean>>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Never returns the error object or its config: it carries the connection
// string. A multi-address connect (localhost) fails with an AggregateError
// whose own message is empty, so it falls back to its code and inner messages.
function describeError(error: unknown): string {
  let reason = "unknown error";
  if (error instanceof AggregateError) {
    const code = (error as NodeJS.ErrnoException).code ?? error.name;
    const inner = error.errors
      .filter((item): item is Error => item instanceof Error)
      .map((item) => item.message)
      .filter(Boolean);
    reason = [code, ...inner].join(": ");
  } else if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    reason = error.message || code || error.name;
  }
  return reason;
}

// Resolves true when `select 1` works through the pool. The response body
// carries no details, so the reason is logged here.
async function checkPool(
  pool: PoolName,
  run: () => Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let isHealthy = true;
  try {
    await withTimeout(run(), timeoutMs);
  } catch (error) {
    isHealthy = false;
    console.error(`healthz: ${pool} pool failed: ${describeError(error)}`);
  }
  return isHealthy;
}

function checkDb(db: Db, timeoutMs: number): Promise<boolean> {
  const running = Promise.all([
    checkPool(
      "tenant",
      () => db.withTenant(NIL_UUID, (tx) => tx.execute(sql`select 1`)),
      timeoutMs,
    ),
    checkPool(
      "system",
      () => db.withSystem((tx) => tx.execute(sql`select 1`)),
      timeoutMs,
    ),
  ])
    .then((results) => results.every(Boolean))
    .finally(() => inFlight.delete(db));
  inFlight.set(db, running);
  return running;
}

export async function getHealthResponse(
  db: Db,
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<Response> {
  const isOk = await (inFlight.get(db) ?? checkDb(db, timeoutMs));

  return Response.json(
    { ok: isOk },
    { status: isOk ? 200 : 503, headers: NO_STORE },
  );
}
