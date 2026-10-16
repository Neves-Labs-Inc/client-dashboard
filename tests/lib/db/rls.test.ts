import { randomUUID } from "node:crypto";
import {
  count,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "@/lib/db/db";
import {
  AUTH_TABLES,
  githubBoards,
  organization,
  requests,
  tasks,
  user,
} from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { insertProject, insertTask } from "../../support/board";
import { insertClients } from "../../support/clients";
import { insertRequest, insertUser } from "../../support/requests";
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

// What reading a column app_tenant has no SELECT grant on raises.
const PERMISSION_DENIED = {
  kind: "refused",
  code: "42501",
  message: expect.stringMatching(/permission denied/),
};

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const ownerUrl = getMigrateEnv().DATABASE_URL_OWNER;
const seededClientIds: string[] = [];
const seededUserIds = RLS_REGISTRY.flatMap((entry) =>
  entry.tenantUserId === undefined ? [] : [entry.tenantUserId],
);

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
    // Seeds' Client organizations, parents of every registered table.
    await ownerDb
      .delete(organization)
      .where(inArray(organization.id, seededClientIds));
    // Submitters, once nothing references them.
    await ownerDb.delete(user).where(inArray(user.id, seededUserIds));
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
  // app.user_id, for a table whose write policies check it.
  userId?: string;
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
      sql`select set_config('app.client_id', ${input.clientId}, true),
        set_config('app.user_id', ${input.userId ?? ""}, true)`,
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

type ReadOutcome =
  | { kind: "read"; rows: Record<string, unknown>[] }
  | { kind: "refused"; code: string; message: string };

// Runs a read through withTenant and reports a refusal instead of throwing,
// so a test can assert on the error code.
async function readAsTenant(
  clientId: string,
  query: SQL,
): Promise<ReadOutcome> {
  try {
    const result = await db.withTenant(clientId, (tx) =>
      tx.execute<Record<string, unknown>>(query),
    );
    return { kind: "read", rows: result.rows };
  } catch (error) {
    const pgError = getPgError(error);
    if (pgError === null) throw error;
    return { kind: "refused", ...pgError };
  }
}

// Runs a write through withTenant (the real grants) and reports a refusal
// instead of throwing.
async function writeAsTenant(
  clientId: string,
  statement: SQL,
  userId?: string,
): Promise<WriteOutcome> {
  const options = userId === undefined ? undefined : { userId };
  try {
    const result = await db.withTenant(
      clientId,
      (tx) => tx.execute(statement),
      options,
    );
    return { kind: "applied", rowCount: result.rowCount ?? 0 };
  } catch (error) {
    const pgError = getPgError(error);
    if (pgError === null) throw error;
    return { kind: "refused", ...pgError };
  }
}

// Every privilege a role can hold on a table, and the ones that can also be
// granted per column.
const TABLE_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];
const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];

// The privileges app_tenant holds on these tables, table-wide or on any
// column (directly, via PUBLIC or via a role it belongs to). The has_*
// functions see every role's grants; information_schema only shows the
// caller's own, so it can't check app_tenant from app_system.
async function getTenantPrivileges(
  tableNames: string[],
): Promise<{ table: string; privilege: string }[]> {
  const inTables = sql.join(
    tableNames.map((name) => sql`${name}`),
    sql`, `,
  );
  const tablePrivileges = sql.join(
    TABLE_PRIVILEGES.map((privilege) => sql`${privilege}`),
    sql`, `,
  );
  const columnPrivileges = sql.join(
    COLUMN_PRIVILEGES.map((privilege) => sql`${privilege}`),
    sql`, `,
  );
  return db.withSystem(async (tx) => {
    const result = await tx.execute<{ table: string; privilege: string }>(
      sql`select relname as "table", privilege
        from pg_class
        cross join unnest(array[${tablePrivileges}]::text[]) as privilege
        where relnamespace = 'public'::regnamespace
          and relname in (${inTables})
          and (
            has_table_privilege('app_tenant', oid, privilege)
            or (
              privilege in (${columnPrivileges})
              and has_any_column_privilege('app_tenant', oid, privilege)
            )
          )
        order by relname, privilege`,
    );
    return result.rows;
  });
}

const REGISTERED_TABLES = RLS_REGISTRY.map((entry) => ({
  ...entry,
  tableName: getTableName(entry.table),
}));

describe.each(REGISTERED_TABLES)(
  "RLS on $tableName",
  ({ table, tableName, tenantColumn, tenantReadable, seed, tenantUserId }) => {
    const clientA = randomUUID();
    const clientB = randomUUID();
    const column = sql.identifier(tenantColumn.name);
    const allColumns = Object.values(getTableColumns(table));
    const adminOnlyColumns = allColumns.filter(
      (candidate) => !tenantReadable.includes(candidate),
    );

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

    it("refuses app_tenant every Admin-only column", async () => {
      const outcomes: { column: string; outcome: ReadOutcome }[] = [];
      for (const adminOnly of adminOnlyColumns) {
        const outcome = await readAsTenant(
          clientA,
          sql`select ${sql.identifier(adminOnly.name)} from ${table}`,
        );
        outcomes.push({ column: adminOnly.name, outcome });
      }

      expect(outcomes).toEqual(
        adminOnlyColumns.map((adminOnly) => ({
          column: adminOnly.name,
          outcome: PERMISSION_DENIED,
        })),
      );
    });

    it.runIf(adminOnlyColumns.length > 0)(
      "refuses app_tenant select *",
      async () => {
        const outcome = await readAsTenant(
          clientA,
          sql`select * from ${table}`,
        );

        expect(outcome).toEqual(PERMISSION_DENIED);
      },
    );

    it("shows Client A its own rows through every readable column", async () => {
      const readable = sql.join(
        tenantReadable.map((readableColumn) =>
          sql.identifier(readableColumn.name),
        ),
        sql`, `,
      );

      const outcome = await readAsTenant(
        clientA,
        sql`select ${readable} from ${table}`,
      );

      expect(outcome.kind).toBe("read");
      const rows = outcome.kind === "read" ? outcome.rows : [];
      expect(rows).not.toHaveLength(0);
      expect(rows.every((row) => row[tenantColumn.name] === clientA)).toBe(
        true,
      );
    });

    it("lets app_system read every column of Client A's rows", async () => {
      const rows = await db.withSystem(async (tx) => {
        const result = await tx.execute<Record<string, unknown>>(
          sql`select * from ${table} where ${column} = ${clientA}`,
        );
        return result.rows;
      });

      expect(rows).not.toHaveLength(0);
      expect(Object.keys(rows[0]).toSorted()).toEqual(
        allColumns.map((each) => each.name).toSorted(),
      );
    });

    const rowsOfB = sql`select * from ${table} where ${column} = ${clientB}`;

    it("refuses Client A inserting a row for Client B", async () => {
      // A copy of B's real row, so belonging to B is the only reason to
      // refuse it. WITH CHECK runs before unique checks, so the duplicate key
      // can't mask the outcome. The row travels as jsonb so every column
      // type (jsonb, enums, dates) round-trips without per-type handling.
      const [rowOfB] = await db
        .withSystem((tx) =>
          tx.execute<{ row: unknown }>(
            sql`select to_jsonb(row_of_b) as "row"
              from (${rowsOfB}) as row_of_b limit 1`,
          ),
        )
        .then((result) => result.rows);
      const insert = sql`insert into ${table}
        select * from jsonb_populate_record(
          null::${table}, ${JSON.stringify(rowOfB.row)}::jsonb
        )`;

      const write = await runTenantWrite({
        table,
        clientId: clientA,
        userId: tenantUserId,
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
        userId: tenantUserId,
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
        userId: tenantUserId,
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
        userId: tenantUserId,
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

describe("Client-owned tables", () => {
  const registeredTableNames = REGISTERED_TABLES.map(
    (entry) => entry.tableName,
  );

  it("give app_tenant no table-wide SELECT, only column grants", async () => {
    // A table-wide grant would cover any column added later; column grants
    // don't. has_table_privilege ignores column grants, and unlike
    // information_schema it sees grants to roles other than the caller's.
    const tableWide = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ table: string }>(
        sql`select relname as "table" from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in (${sql.join(
              registeredTableNames.map((name) => sql`${name}`),
              sql`, `,
            )})
            and has_table_privilege('app_tenant', oid, 'SELECT')`,
      );
      return result.rows;
    });

    expect(tableWide).toEqual([]);
  });

  it("give app_tenant only SELECT, plus INSERT and UPDATE on requests", async () => {
    const granted = await getTenantPrivileges(registeredTableNames);

    const expected = registeredTableNames
      .toSorted()
      .flatMap((table) =>
        (table === "requests"
          ? ["INSERT", "SELECT", "UPDATE"]
          : ["SELECT"]
        ).map((privilege) => ({ table, privilege })),
      );
    expect(granted).toEqual(expected);
  });

  it("let app_tenant insert and update only the Client User's requests columns", async () => {
    const columns = await db.withSystem(async (tx) => {
      const result = await tx.execute<{
        column: string;
        isInsertable: boolean;
        isUpdatable: boolean;
      }>(
        sql`select attname as "column",
            has_column_privilege('app_tenant', attrelid, attnum, 'INSERT')
              as "isInsertable",
            has_column_privilege('app_tenant', attrelid, attnum, 'UPDATE')
              as "isUpdatable"
          from pg_attribute
          where attrelid = 'requests'::regclass and attnum > 0
            and not attisdropped
          order by attname`,
      );
      return result.rows;
    });

    const insertable = columns
      .filter((column) => column.isInsertable)
      .map((column) => column.column);
    const updatable = columns
      .filter((column) => column.isUpdatable)
      .map((column) => column.column);
    expect(insertable).toEqual([
      "client_id",
      "description",
      "kind",
      "project_id",
      "submitter_id",
      "title",
    ]);
    expect(updatable).toEqual([
      "description",
      "kind",
      "project_id",
      "status",
      "title",
    ]);
  });
});

describe("hidden Tasks", () => {
  const clientId = randomUUID();
  let projectId = "";
  let visibleTaskId = "";
  let hiddenTaskId = "";

  beforeAll(async () => {
    seededClientIds.push(clientId);
    await db.withSystem(async (tx) => {
      await insertClients(tx, [clientId]);
      projectId = await insertProject(tx, { clientId });
      visibleTaskId = await insertTask(tx, { clientId, projectId });
      hiddenTaskId = await insertTask(tx, {
        clientId,
        projectId,
        hiddenAt: new Date(),
      });
    });
  });

  it("are not returned to app_tenant by id", async () => {
    const rows = await db.withTenant(clientId, (tx) =>
      tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, hiddenTaskId)),
    );

    expect(rows).toEqual([]);
  });

  it("are left out of their Project's Tasks for app_tenant", async () => {
    const rows = await db.withTenant(clientId, (tx) =>
      tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.projectId, projectId)),
    );

    expect(rows).toEqual([{ id: visibleTaskId }]);
  });

  it("are left out of app_tenant's count", async () => {
    const [row] = await db.withTenant(clientId, (tx) =>
      tx.select({ total: count() }).from(tasks),
    );

    expect(row.total).toBe(1);
  });

  it("stay readable to app_system", async () => {
    const rows = await db.withSystem((tx) =>
      tx.select().from(tasks).where(eq(tasks.projectId, projectId)),
    );

    expect(rows.map((row) => row.id).toSorted()).toEqual(
      [visibleTaskId, hiddenTaskId].toSorted(),
    );
  });
});

// The tenant write backstop on requests: through withTenant with the real
// grants, a Client User may only submit New Requests as themselves, and only
// edit or withdraw their own New ones.
describe("requests as app_tenant", () => {
  const clientA = randomUUID();
  const clientB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  // Seeded Requests' status time, far enough back that a change shows.
  const SEEDED_STATUS_CHANGED_AT = new Date("2020-01-01T00:00:00Z");

  beforeAll(async () => {
    seededClientIds.push(clientA, clientB);
    seededUserIds.push(userA, userB);
    await db.withSystem(async (tx) => {
      await insertClients(tx, [clientA, clientB]);
      await insertUser(tx, userA);
      await insertUser(tx, userB);
    });
  });

  function seedRequest(
    input: { submitterId?: string; status?: "NEW" | "ACCEPTED" } = {},
  ): Promise<string> {
    return db.withSystem(async (tx) => {
      const request = await insertRequest(tx, {
        clientId: clientA,
        submitterId: input.submitterId ?? userA,
        status: input.status ?? "NEW",
        statusChangedAt: SEEDED_STATUS_CHANGED_AT,
      });
      return request.id;
    });
  }

  async function readRequest(
    requestId: string,
  ): Promise<{ title: string; status: string }> {
    const [row] = await db
      .withSystem((tx) =>
        tx.execute<{ title: string; status: string }>(
          sql`select title, status from requests where id = ${requestId}`,
        ),
      )
      .then((result) => result.rows);
    return row;
  }

  async function readStatusChangedAt(requestId: string): Promise<Date> {
    const [row] = await db.withSystem((tx) =>
      tx
        .select({ statusChangedAt: requests.statusChangedAt })
        .from(requests)
        .where(eq(requests.id, requestId)),
    );
    return row.statusChangedAt;
  }

  function buildInsert(input: { clientId: string; submitterId: string }): SQL {
    return sql`insert into requests
      (client_id, submitter_id, kind, title, description)
      values (${input.clientId}, ${input.submitterId}, 'BUG', 'Login fails',
        'Steps to reproduce.')`;
  }

  describe("inserting", () => {
    it("lets a Client User submit a New Request as themselves", async () => {
      const outcome = await writeAsTenant(
        clientA,
        buildInsert({ clientId: clientA, submitterId: userA }),
        userA,
      );

      expect(outcome).toEqual({ kind: "applied", rowCount: 1 });
    });

    it("refuses a Request submitted as another user", async () => {
      const outcome = await writeAsTenant(
        clientA,
        buildInsert({ clientId: clientA, submitterId: userB }),
        userA,
      );

      expect(outcome).toEqual(WITH_CHECK_VIOLATION);
    });

    it("refuses setting the status: it isn't an insertable column", async () => {
      const outcome = await writeAsTenant(
        clientA,
        sql`insert into requests
          (client_id, submitter_id, kind, title, description, status)
          values (${clientA}, ${userA}, 'BUG', 'Login fails',
            'Steps to reproduce.', 'ACCEPTED')`,
        userA,
      );

      expect(outcome).toEqual(PERMISSION_DENIED);
    });

    it("refuses a Request for another Client", async () => {
      const outcome = await writeAsTenant(
        clientA,
        buildInsert({ clientId: clientB, submitterId: userA }),
        userA,
      );

      expect(outcome).toEqual(WITH_CHECK_VIOLATION);
    });

    it("refuses every Request when no userId is set", async () => {
      const outcome = await writeAsTenant(
        clientA,
        buildInsert({ clientId: clientA, submitterId: userA }),
      );

      expect(outcome).toEqual(WITH_CHECK_VIOLATION);
    });
  });

  describe("updating", () => {
    it("lets the submitter edit their New Request", async () => {
      const requestId = await seedRequest();

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set title = 'Login fails on Safari'
          where id = ${requestId}`,
        userA,
      );

      expect(outcome).toEqual({ kind: "applied", rowCount: 1 });
      expect(await readRequest(requestId)).toEqual({
        title: "Login fails on Safari",
        status: "NEW",
      });
      expect(await readStatusChangedAt(requestId)).toEqual(
        SEEDED_STATUS_CHANGED_AT,
      );
    });

    it("lets the submitter withdraw their New Request", async () => {
      const requestId = await seedRequest();

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set status = 'WITHDRAWN' where id = ${requestId}`,
        userA,
      );

      expect(outcome).toEqual({ kind: "applied", rowCount: 1 });
      expect((await readRequest(requestId)).status).toBe("WITHDRAWN");
      // Set by the trigger: the submitter can't write the column.
      expect((await readStatusChangedAt(requestId)).getTime()).toBeGreaterThan(
        SEEDED_STATUS_CHANGED_AT.getTime(),
      );
    });

    it("refuses the submitter accepting their own Request", async () => {
      const requestId = await seedRequest();

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set status = 'ACCEPTED' where id = ${requestId}`,
        userA,
      );

      expect(outcome).toEqual(WITH_CHECK_VIOLATION);
      expect((await readRequest(requestId)).status).toBe("NEW");
    });

    it("changes no Request that is no longer New", async () => {
      const requestId = await seedRequest({ status: "ACCEPTED" });

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set title = 'Changed' where id = ${requestId}`,
        userA,
      );

      expect(outcome).toEqual({ kind: "applied", rowCount: 0 });
      expect(await readRequest(requestId)).toEqual({
        title: "Test request",
        status: "ACCEPTED",
      });
    });

    it("changes no Request of another user", async () => {
      const requestId = await seedRequest({ submitterId: userB });

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set status = 'WITHDRAWN' where id = ${requestId}`,
        userA,
      );

      expect(outcome).toEqual({ kind: "applied", rowCount: 0 });
      expect((await readRequest(requestId)).status).toBe("NEW");
    });

    it("changes no Request when no userId is set", async () => {
      const requestId = await seedRequest();

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set title = 'Changed' where id = ${requestId}`,
      );

      expect(outcome).toEqual({ kind: "applied", rowCount: 0 });
    });

    it.each([
      { column: "response_note", value: "Thanks" },
      { column: "task_id", value: randomUUID() },
      { column: "task_title", value: "Fix login" },
      { column: "status_changed_at", value: "2019-01-01T00:00:00Z" },
    ])("refuses the submitter setting $column", async ({ column, value }) => {
      const requestId = await seedRequest();

      const outcome = await writeAsTenant(
        clientA,
        sql`update requests set ${sql.identifier(column)} = ${value}
          where id = ${requestId}`,
        userA,
      );

      expect(outcome).toEqual(PERMISSION_DENIED);
    });
  });

  it("refuses the submitter deleting their New Request", async () => {
    const requestId = await seedRequest();

    const outcome = await writeAsTenant(
      clientA,
      sql`delete from requests where id = ${requestId}`,
      userA,
    );

    expect(outcome).toEqual(PERMISSION_DENIED);
  });
});

describe("Better Auth tables", () => {
  const authTableNames = AUTH_TABLES.map((table) => getTableName(table));
  const inAuthTables = sql.join(
    authTableNames.map((name) => sql`${name}`),
    sql`, `,
  );

  it("give app_tenant no privileges at all", async () => {
    const granted = await getTenantPrivileges(authTableNames);

    expect(granted).toEqual([]);
  });

  it("refuse app_tenant reading any of them", async () => {
    const tenant = new pg.Client({
      connectionString: env.DATABASE_URL_TENANT,
    });
    await tenant.connect();
    try {
      const outcomes: { name: string; outcome: string | undefined }[] = [];
      for (const name of authTableNames) {
        const outcome = await tenant
          .query(`select 1 from ${tenant.escapeIdentifier(name)} limit 1`)
          .then(() => "read")
          .catch((error: unknown) => getPgError(error)?.code);
        outcomes.push({ name, outcome });
      }

      expect(outcomes).toEqual(
        authTableNames.map((name) => ({ name, outcome: "42501" })),
      );
    } finally {
      await tenant.end();
    }
  });

  it("give app_system read and write on every one", async () => {
    const privileges = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ table: string; privilege: string }>(
        sql`select table_name as "table", privilege_type as privilege
          from information_schema.role_table_grants
          where grantee = 'app_system'
            and table_schema = 'public'
            and table_name in (${inAuthTables})
          order by table_name, privilege_type`,
      );
      return result.rows;
    });

    const expected = authTableNames.toSorted().flatMap((table) =>
      ["DELETE", "INSERT", "SELECT", "UPDATE"].map((privilege) => ({
        table,
        privilege,
      })),
    );
    expect(privileges).toEqual(expected);
  });

  it("have no RLS", async () => {
    const withRls = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ name: string }>(
        sql`select relname as name from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in (${inAuthTables})
            and relrowsecurity`,
      );
      return result.rows;
    });

    expect(withRls).toEqual([]);
  });
});

describe("github_boards", () => {
  const tableName = getTableName(githubBoards);

  it("gives app_tenant no privileges", async () => {
    const granted = await getTenantPrivileges([tableName]);

    expect(granted).toEqual([]);
  });

  it("refuses app_tenant reading it", async () => {
    const tenant = new pg.Client({
      connectionString: env.DATABASE_URL_TENANT,
    });
    await tenant.connect();
    try {
      const outcome = await tenant
        .query(`select 1 from ${tenant.escapeIdentifier(tableName)} limit 1`)
        .then(() => "read")
        .catch((error: unknown) => getPgError(error)?.code);

      expect(outcome).toBe("42501");
    } finally {
      await tenant.end();
    }
  });

  it("gives app_system read and write", async () => {
    const privileges = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ privilege: string }>(
        sql`select privilege_type as privilege
          from information_schema.role_table_grants
          where grantee = 'app_system'
            and table_schema = 'public'
            and table_name = ${tableName}
          order by privilege_type`,
      );
      return result.rows.map((row) => row.privilege);
    });

    expect(privileges).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
  });

  it("has no RLS", async () => {
    const isEnabled = await db.withSystem(async (tx) => {
      const result = await tx.execute<{ isEnabled: boolean }>(
        sql`select relrowsecurity as "isEnabled"
          from pg_class where oid = to_regclass(${tableName})`,
      );
      return result.rows[0].isEnabled;
    });

    expect(isEnabled).toBe(false);
  });
});

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
