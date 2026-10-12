import { randomUUID } from "node:crypto";
import { getTableName, inArray, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "@/lib/db/db";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { getPgError } from "../../support/pg-error";
import { RLS_REGISTRY } from "./rls-registry";

// Cross-Client isolation for every table in RLS_REGISTRY: as app_tenant with
// Client A set, Client B's rows can't be seen or changed. Reads go through
// withTenant; writes through runTenantWrite (see why there).

// What a policy's WITH CHECK raises. A missing grant raises the same code
// with "permission denied", so the message tells the two apart.
const WITH_CHECK_VIOLATION = {
  kind: "refused",
  code: "42501",
  message: expect.stringMatching(/new row violates row-level security policy/),
};

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const ownerUrl = getMigrateEnv().DATABASE_URL_OWNER;
const seededClientIds: string[] = [];

afterAll(async () => {
  // Cleanup runs as the owner (BYPASSRLS locally and in CI) on its own
  // connection: app_system has no DELETE on clients, and a rolled-back owner
  // transaction can't hold rows the data module's pools must see.
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    const ownerDb = drizzle({ client: owner });
    // Children before parents.
    for (const entry of RLS_REGISTRY.toReversed()) {
      await ownerDb
        .delete(entry.table)
        .where(inArray(entry.tenantColumn, seededClientIds));
    }
  } finally {
    await owner.end();
    await db.close();
  }
});

type WriteOutcome =
  | { kind: "applied"; rowCount: number }
  | { kind: "refused"; code: string; message: string };

type TenantWrite = {
  outcome: WriteOutcome;
  watchedBefore: unknown[];
  watchedAfter: unknown[];
};

type TenantWriteInput = {
  table: PgTable;
  clientId: string;
  statement: SQL;
  // Rows read (as the owner) just before and just after the write.
  watch: SQL;
};

// Runs a write as app_tenant with app.client_id set, but with full write
// grants, so only the policy can stop it: a table whose grants already refuse
// the write would otherwise prove the grant, never the policy's WITH CHECK.
// A GRANT is only visible to its own transaction until it commits, so this
// can't go through withTenant's pool: it runs on one owner connection,
// switches to app_tenant with SET LOCAL ROLE, and always rolls back, so the
// real grants (and any row the write changed) are never touched.
async function runTenantWrite(input: TenantWriteInput): Promise<TenantWrite> {
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  const ownerDb = drizzle({ client: owner });
  try {
    await ownerDb.execute(sql`begin`);
    await ownerDb.execute(
      sql`grant insert, update, delete on ${input.table} to app_tenant`,
    );
    // The owner created app_tenant, so it may grant itself SET on it.
    await ownerDb.execute(sql`grant app_tenant to current_user`);
    const watchedBefore = (await ownerDb.execute(input.watch)).rows;

    await ownerDb.execute(sql`set local role app_tenant`);
    await ownerDb.execute(
      sql`select set_config('app.client_id', ${input.clientId}, true)`,
    );
    // A refused statement aborts the transaction; the savepoint keeps it
    // usable for the read-back.
    await ownerDb.execute(sql`savepoint attempt`);
    let outcome: WriteOutcome;
    try {
      const result = await ownerDb.execute(input.statement);
      outcome = { kind: "applied", rowCount: result.rowCount ?? 0 };
    } catch (error) {
      const pgError = getPgError(error);
      if (pgError === null) throw error;
      outcome = { kind: "refused", ...pgError };
      await ownerDb.execute(sql`rollback to savepoint attempt`);
    }

    await ownerDb.execute(sql`reset role`);
    const watchedAfter = (await ownerDb.execute(input.watch)).rows;
    return { outcome, watchedBefore, watchedAfter };
  } finally {
    await ownerDb.execute(sql`rollback`);
    await owner.end();
  }
}

const REGISTERED_TABLES = RLS_REGISTRY.map((entry) => ({
  ...entry,
  tableName: getTableName(entry.table),
}));

describe.each(REGISTERED_TABLES)(
  "RLS on $tableName",
  ({ table, tableName, tenantColumn, seed }) => {
    const clientA = randomUUID();
    const clientB = randomUUID();
    const column = sql.identifier(tenantColumn.name);

    beforeAll(async () => {
      seededClientIds.push(clientA, clientB);
      await db.withSystem(async (tx) => {
        await seed(tx, clientA);
        await seed(tx, clientB);
      });
    });

    it("has RLS enabled and forced", async () => {
      // FORCE only changes what the table owner sees, which no app_tenant
      // check can observe, so the catalog is the only place to assert it.
      const flags = await db.withSystem(async (tx) => {
        const result = await tx.execute<{
          isEnabled: boolean;
          isForced: boolean;
        }>(
          sql`select relrowsecurity as "isEnabled",
              relforcerowsecurity as "isForced"
            from pg_class where oid = to_regclass(${tableName})`,
        );
        return result.rows[0];
      });

      expect(flags).toEqual({ isEnabled: true, isForced: true });
    });

    it("shows Client A only its own rows", async () => {
      const ownerIds = await db.withTenant(clientA, async (tx) => {
        const result = await tx.execute<{ ownerId: string }>(
          sql`select ${column} as "ownerId" from ${table}`,
        );
        return result.rows.map((row) => row.ownerId);
      });

      expect(ownerIds).toContain(clientA);
      expect(ownerIds.every((ownerId) => ownerId === clientA)).toBe(true);
    });

    const rowsOfB = sql`select * from ${table} where ${column} = ${clientB}`;

    it("refuses Client A inserting a row for Client B", async () => {
      // A copy of B's real row, so belonging to B is the only reason to
      // refuse it. WITH CHECK runs before unique checks, so the duplicate key
      // can't mask the outcome.
      const [rowOfB] = await db
        .withSystem((tx) => tx.execute<Record<string, unknown>>(rowsOfB))
        .then((result) => result.rows);
      const columns = Object.keys(rowOfB);
      const insert = sql`insert into ${table}
        (${sql.join(
          columns.map((name) => sql.identifier(name)),
          sql`, `,
        )})
        values (${sql.join(
          columns.map((name) => sql`${rowOfB[name]}`),
          sql`, `,
        )})`;

      const write = await runTenantWrite({
        table,
        clientId: clientA,
        statement: insert,
        watch: rowsOfB,
      });

      expect(write.outcome).toEqual(WITH_CHECK_VIOLATION);
      expect(write.watchedAfter).toEqual(write.watchedBefore);
    });

    it("refuses Client A moving its own row to Client B", async () => {
      const write = await runTenantWrite({
        table,
        clientId: clientA,
        statement: sql`update ${table} set ${column} = ${clientB}
          where ${column} = ${clientA}`,
        watch: rowsOfB,
      });

      expect(write.outcome).toEqual(WITH_CHECK_VIOLATION);
      expect(write.watchedAfter).toEqual(write.watchedBefore);
    });

    it("lets Client A update none of Client B's rows", async () => {
      const write = await runTenantWrite({
        table,
        clientId: clientA,
        statement: sql`update ${table} set ${column} = ${column}
          where ${column} = ${clientB}`,
        watch: rowsOfB,
      });

      expect(write.outcome).toEqual({ kind: "applied", rowCount: 0 });
      expect(write.watchedAfter).toEqual(write.watchedBefore);
    });

    it("lets Client A delete none of Client B's rows", async () => {
      const write = await runTenantWrite({
        table,
        clientId: clientA,
        statement: sql`delete from ${table} where ${column} = ${clientB}`,
        watch: rowsOfB,
      });

      expect(write.outcome).toEqual({ kind: "applied", rowCount: 0 });
      expect(write.watchedBefore).not.toHaveLength(0);
      expect(write.watchedAfter).toEqual(write.watchedBefore);
    });

    it("shows nothing when no Client is set", async () => {
      const tenant = new pg.Client({
        connectionString: env.DATABASE_URL_TENANT,
      });
      await tenant.connect();
      try {
        const result = await tenant.query<{ count: number }>(
          `select count(*)::int as count from ${tenant.escapeIdentifier(tableName)}`,
        );

        expect(result.rows[0].count).toBe(0);
      } finally {
        await tenant.end();
      }
    });
  },
);

describe("role guards", () => {
  it("gives app_system BYPASSRLS and app_tenant none", async () => {
    const roles = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ name: string; bypassesRls: boolean }>(
        sql`select rolname as name, rolbypassrls as "bypassesRls"
          from pg_roles where rolname in ('app_system', 'app_tenant')
          order by rolname`,
      );
      return result.rows;
    });

    expect(roles).toEqual([
      { name: "app_system", bypassesRls: true },
      { name: "app_tenant", bypassesRls: false },
    ]);
  });
});
