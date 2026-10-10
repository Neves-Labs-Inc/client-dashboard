# Does the RLS role design work on Neon?

Resolves research ticket #21 (map #1). Researched 2026-10-10 against Neon docs (source: `neondatabase/website`), Neon's compute source (`neondatabase/neon`), the Postgres docs, and the PgBouncer docs.

Design under test (ADR 0003, as summarised on map #1, since `docs/adr/0003-*.md` and `0004-*.md` are not yet committed to any pushed branch):

- RLS `ENABLE` + `FORCE` on every Client-owned table.
- `app_tenant` serves Client Users and runs `SET LOCAL app.client_id` in each transaction.
- `app_system` has `BYPASSRLS` and serves the Admin, the GitHub sync and Better Auth.
- Roles are created in migrations. The app runs on Vercel and connects to Neon through the pooled connection string.
- The poll is triggered by Cron and guarded by an advisory lock.

## Verdict

**It works on Neon, with three conditions:**

1. Create `app_tenant`, `app_system` and any migrator role **with SQL in a migration**, not in the Neon Console, CLI or API.
2. Run that migration as the project's default role (`neondb_owner`) on **Postgres 16 or later**. New Neon projects default to Postgres 18 [16].
3. Run all tenant-scoped work and the poll inside an explicit, interactive transaction. Run migrations over the **direct** (non-pooled) URL.

## 1. Can `app_system` get `BYPASSRLS`?

**Yes, if `neondb_owner` creates it with SQL on Postgres 16 or later.**

- Neon creates the Console, CLI and API roles, including the default `neondb_owner`, with `CREATE ROLE <name> INHERIT CREATEROLE CREATEDB BYPASSRLS REPLICATION IN ROLE neon_superuser`. So the default role holds `BYPASSRLS` **itself**, not only through its `neon_superuser` membership. [1]
- Neon's docs agree: admin connection strings such as `neondb_owner` "include the `BYPASSRLS` attribute". [2] `neon_superuser` has carried `BYPASSRLS` since the 2023-08-15 release. Projects created before that date lack it. [3][4]
- Postgres 16+: "Only superuser roles or roles with `BYPASSRLS` can specify `BYPASSRLS`." So `neondb_owner` can run `CREATE ROLE app_system LOGIN PASSWORD '…' BYPASSRLS`. [5]
- Postgres 15 and earlier: "You must be a superuser to create a new role having the `BYPASSRLS` attribute." Neon gives no superuser access, so on PG ≤15 this would fail. [6][3] **Unconfirmed:** whether Neon patches PG14/15 to allow it. Avoid the question by using PG16+.
- Postgres also says `CREATEROLE` alone "does not confer the ability to grant or revoke the `BYPASSRLS` privilege". The permission comes from the creator holding `BYPASSRLS`, not from `CREATEROLE`. [7]
- **Do not create `app_system` in the Console, CLI or API.** That would also give it `CREATEROLE`, `CREATEDB`, `REPLICATION`, `pg_read_all_data` and `pg_write_all_data` through `neon_superuser`, which is far more than the app needs. [3][1]
- **Caveat:** Neon compute migration `0002-alter_roles.sql` runs `ALTER ROLE … NOBYPASSRLS` on every role that is not a `neon_superuser` member. It fixed a 2023 incident. [8] Neon tracks its migrations by id in `neon_migration.migration_id`, and they run once, so a new project has already applied it before our roles exist. [9] **Unconfirmed:** that no future Neon migration will reset it. Add a check to the RLS test suite: `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_system'`.

## 2. Migrator owns the tables, `app_tenant` under `FORCE ROW LEVEL SECURITY`?

**Yes. This is plain Postgres and Neon does not restrict it.**

- Roles created with SQL get only basic `public` schema privileges and "must be selectively granted permissions". That fits `app_tenant`, with its own `GRANT`s and `ALTER DEFAULT PRIVILEGES`. [3]
- `app_tenant` does not own the tables and has no `BYPASSRLS`, so policies always apply to it. With no policy, access is default-deny. [10]
- `FORCE ROW LEVEL SECURITY` only changes things for the **table owner**: "Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with `ALTER TABLE … FORCE ROW LEVEL SECURITY`." [10] It is still a worthwhile fail-closed guard.
- "Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system." [10] If the migrator is `neondb_owner`, which holds `BYPASSRLS`, `FORCE` will not stop it. That is fine for migrations. Neon's own guidance is to use the admin role only for migrations and privileged jobs. [2]
- Recommended: let `neondb_owner` (or an SQL-created `app_migrator`) own the tables. `app_tenant` must **never** be a `neon_superuser` member.

## 3. `SET LOCAL app.client_id` and `pg_try_advisory_xact_lock` over the pooled URL

**Both work, inside an explicit transaction.**

- Neon runs PgBouncer with `pool_mode=transaction`. Its list of unsupported features names session `SET`/`RESET` and **session-level** advisory locks. It does not name `SET LOCAL` or transaction-level advisory locks. [11] The PgBouncer docs mark "SET/RESET" and "Session-level advisory locks" as "Never" under transaction pooling. [12]
- `SET LOCAL` lasts "only till the end of the current transaction, whether committed or not". `set_config(name, value, true)` is the same thing as a function. [13][14] The transaction never leaves its pinned server connection, so the value cannot leak to another client. Neon's Drizzle RLS guide uses this exact pattern over its pooled `Pool`: `db.transaction(tx => tx.execute(sql\`select set_config(…, true)\`))`. [2]
- **Gotcha:** "Issuing [`SET LOCAL`] outside of a transaction block emits a warning and otherwise has no effect." [13] Without `BEGIN`, the scoping silently does nothing, though RLS still fails closed. The scoped data module should always open a transaction.
- `pg_try_advisory_xact_lock` is held "until the current transaction ends; there is no provision for manual release". [14] This suits transaction pooling, because the lock lives exactly as long as the pinned connection. The whole poll body must run inside that one transaction.
- **Driver choice:** Neon's HTTP driver (`neon()`, i.e. `drizzle-orm/neon-http`) supports only non-interactive transactions. Use `Pool` over WebSockets, or `pg` over TCP, for interactive transactions. [15] So the app needs `drizzle-orm/neon-serverless` (Pool) or `node-postgres`, not `neon-http`.
- Pooled `app_tenant` and `app_system` get separate pools, because the pool limit is per user per database. [11]
- Use the **direct** URL for migrations. Neon's table lists "Schema migrations → Direct". [11]
- **Unconfirmed (behaviour, not documented by Neon):** after a `SET LOCAL` of a custom `app.*` setting ends, a reused connection may report `current_setting('app.client_id', true)` as `''` rather than `NULL`. Write policies as `client_id = NULLIF(current_setting('app.client_id', true), '')::uuid` so both cases fail closed.

## 4. Anything blocked? Closest alternatives

Nothing is blocked on a PG16+ project. Fallbacks, in case a check fails:

- **PG ≤15 project, or `BYPASSRLS` refused:** give `app_system` a permissive policy instead of the attribute: `CREATE POLICY system_all ON <t> TO app_system USING (true) WITH CHECK (true)`. That is plain Postgres, it is portable to RDS, and it needs no special attribute. [10] Another option is to make `app_system` the table owner without `FORCE`. That conflicts with the separate migrator design, so the policy route is better.
- **If the pooled URL caused trouble:** use the direct URL for `app_tenant`. That costs connection churn on Vercel functions. [11]

## Sources

1. Neon compute source, `compute_tools/src/spec_apply.rs` (role creation, commit fa504217): https://github.com/neondatabase/neon/blob/fa504217c61bbcaf5c512d75830564541f917f8f/compute_tools/src/spec_apply.rs
2. Neon docs, Run RLS queries with Drizzle ORM: https://neon.com/docs/guides/rls-query-execution
3. Neon docs, Manage roles (`neon_superuser`): https://neon.com/docs/manage/roles#the-neonsuperuser-role
4. Neon changelog 2023-08-15, BYPASSRLS added to `neon_superuser`: https://neon.com/docs/changelog/2023-08-15
5. Postgres 17, CREATE ROLE: https://www.postgresql.org/docs/17/sql-createrole.html
6. Postgres 15, CREATE ROLE: https://www.postgresql.org/docs/15/sql-createrole.html
7. Postgres 17, Role attributes: https://www.postgresql.org/docs/17/role-attributes.html
8. Neon compute migration `0002-alter_roles.sql`: https://github.com/neondatabase/neon/blob/fa504217c61bbcaf5c512d75830564541f917f8f/compute_tools/src/migrations/0002-alter_roles.sql
9. Neon compute migration runner, `compute_tools/src/migration.rs`: https://github.com/neondatabase/neon/blob/fa504217c61bbcaf5c512d75830564541f917f8f/compute_tools/src/migration.rs
10. Postgres 17, Row Security Policies: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
11. Neon docs, Connection pooling: https://neon.com/docs/connect/connection-pooling
12. PgBouncer, Features: https://www.pgbouncer.org/features.html
13. Postgres 17, SET: https://www.postgresql.org/docs/17/sql-set.html
14. Postgres 17, System administration functions (`set_config`, advisory locks): https://www.postgresql.org/docs/17/functions-admin.html
15. Neon docs, Neon serverless driver: https://neon.com/docs/serverless/serverless-driver
16. Neon roadmap (Postgres 18 default for new projects): https://neon.com/docs/introduction/roadmap
