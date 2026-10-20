# Pipeline notes

## Commands

- Install: `pnpm install`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Format check: `pnpm format:check`
- Tests: `pnpm test` (needs Postgres and Mailpit; see Gotchas)
- Migrations: `pnpm db:generate` (should report no schema changes after a migration is written)

## Gotchas

- **Port 5432 is taken** by another project's container, so `.env`/`.env.test` DB logins fail. Run a throwaway `postgres:18` per agent on a free port, mounting `docker/postgres-init.sql` at `/docker-entrypoint-initdb.d/init.sql:ro`, and override `DATABASE_URL_TENANT`/`SYSTEM`/`OWNER` to the `.env.test` URLs with that port. Ports 55321/55322 belong to another project's Supabase. Remove containers when done.
- **Mailpit port is fixed:** `tests/support/mailpit.ts` hardcodes API port 8025 (SMTP 1025), so only one agent at a time can run `smtp-mailer.test`. A CLI `--exclude` does not skip it (`vitest.config.ts` uses `projects`, whose own `exclude` wins). When another agent holds 1025/8025, treat an `ECONNREFUSED 127.0.0.1:1025` failure in `smtp-mailer.test` as environmental and say so; run that file alone once the port is free if the diff touches mail.
- **Real GitHub credentials in `.env`:** never click "Sync now" or trigger GitHub calls; simulate sync states with SQL. Admin Home (`/admin`) reads GitHub in its loader (unassigned boards), so browser checks that open Home should start the dev server with every `GITHUB_*` var (and `SMEE_URL`) exported as an empty string: React Router dev reloads `.env` for any var that isn't set, so plain `unset` is not enough; `env.ts` treats empty as unset. A seeded board that never synced counts as stale and lights the sync-problem icon.
- **Headless Chrome is treated as a bot** by the SSR entry (isbot), which disables streaming. Browser checks of loading states need a normal Chrome user agent.
- **Sign-in for browser checks:** Clients sign in by magic link (point the app's SMTP at your own Mailpit on spare ports); the Admin needs a signed passkey session. Prior art: `.scratch/phase-6-requests/review/03-design.md` and `04-design.md`.
- **Parallel worktrees:** create them from `HEAD` with `git worktree add`, run `pnpm install`, copy `.env`, give each its own DB and dev-server ports. Coders must write only inside their worktree (one wrote stale files into the main checkout in Phase 6). Remove worktrees before running `pnpm format:check` in the main tree.
- **Tenant inserts:** Drizzle's `insert()` sends `default` for every column, which fails (42501) when `app_tenant` has column-level INSERT grants; use explicit-column `sql`.
- **Simulating load failures with a table lock:** when holding `LOCK TABLE … ; SELECT pg_sleep(…)` in a background psql, wait for that psql to exit before the next browser step, or the script hangs.
- **Never use `git stash`:** the stash stack is shared across every worktree and other sessions. To check a test fails without your change, copy the file aside or use a temporary commit instead.
- **Postgres init race:** a fresh `postgres:18` container answers `pg_isready` before `docker-entrypoint-initdb.d` has finished (the server restarts after init). Wait until the test database actually exists (e.g. `psql -lqt | grep client_dashboard_test`) before running tests.
- **Drizzle column refs in subqueries:** in a single-table `select`, Drizzle renders `${table.col}` as a bare column name (e.g. `"id"`), so inside a correlated subquery it can bind to the inner table instead (Phase 7: invoice totals all came back 0). Qualify those names by hand (`"invoices"."id"`).
- **Void is final in the DB:** a trigger refuses any status change from `VOID` (even as owner via normal UPDATE), so to rerun a QA step that voids an Invoice, reseed or recreate the throwaway DB rather than trying to reset the row in SQL.
- **Throwaway Postgres password:** start the container with `POSTGRES_PASSWORD=postgres_local` (as in `docker-compose`) so the `.env.test` URLs authenticate once you swap in your port.
- **Admin sign-in for browser checks:** use the real flow (magic link to your own Mailpit on spare ports, then a Playwright/CDP virtual passkey). Don't hand-craft session cookies: the safety classifier blocks reading the old cookie-forging QA scripts.
- **Seeing loading skeletons via client navigation:** `page.evaluate(() => router.navigate(...))` awaits the whole navigation, so the skeleton never shows; use a block body (`() => { router.navigate(...) }`) so it returns immediately.
- **Forcing a single query to fail in the browser:** SQL grants/locks can't isolate queries that read the same column. Instead, start the dev server with `NODE_OPTIONS=--require <preload.cjs>` where the preload wraps the pg client to reject a matching query while a flag file exists (prior art: `.scratch/phase-7b-global-invoices/review/02-design.md`).
- **Never kill processes by pattern:** `pkill -f "port 5201"` killed an unrelated server already on that port (Phase 7b). Check `lsof -nP -iTCP:<port> -sTCP:LISTEN` first; if the port is taken, pick another and use `--strictPort`; stop only the PID you started.
- **Seeds and invoice numbers:** seeds that insert Invoices directly must also set `invoice_counters(year, last_seq)` (e.g. 2026 → highest sequence used), or the first create in the UI fails with 23505.
