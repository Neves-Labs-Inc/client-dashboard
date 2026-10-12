# Runbook

How to run the portal locally, set up prod, and operate it. Prod is Vercel Pro (app) and Neon (Postgres), deployed from GitHub Actions (ADR 0004). The portal lives at `https://portal.neveslabs.dev`.

## 1. Local setup

Prerequisites: Node 24 (the version in `.nvmrc`; `nvm use` picks it up), Docker with Compose, and corepack (ships with Node).

```sh
corepack enable            # provides the pnpm version pinned in package.json
pnpm install
docker compose up -d       # Postgres 18 on 127.0.0.1:5432
cp .env.example .env       # local-only values that match docker-compose.yml
pnpm db:migrate            # migrations as neondb_owner, then role passwords
pnpm dev                   # http://localhost:5173
```

- `docker compose up -d` runs `docker/postgres-init.sql` on first start. It creates the `neondb_owner` role (mirrors Neon's owner: `CREATEROLE`, `BYPASSRLS`, not superuser) and two databases: `client_dashboard` (dev) and `client_dashboard_test` (tests). To start from scratch, `docker compose down -v`.
- `pnpm test` runs Vitest. Its global setup loads `.env.test` (vars already set in the shell win) and migrates `client_dashboard_test` before any suite runs. Postgres must be up.
- Other checks, the same ones CI runs: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`.

Roles are cluster-wide, so the dev and test databases share `app_tenant` and `app_system`. The passwords in `.env` and `.env.test` must match, or each migrate resets the other's.

### Docker image

The `Dockerfile` builds the same app that Vercel serves, so the later AWS move is a redeploy (ADR 0004). CI builds it on every PR.

```sh
docker build -t client-dashboard .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL_TENANT=postgres://app_tenant:app_tenant_local@host.docker.internal:5432/client_dashboard \
  -e DATABASE_URL_SYSTEM=postgres://app_system:app_system_local@host.docker.internal:5432/client_dashboard \
  client-dashboard
```

Then open `http://localhost:3000` and `http://localhost:3000/healthz`. `host.docker.internal` is Docker Desktop's name for the host. On Linux it would reach the bridge IP, but compose binds Postgres to `127.0.0.1` only, so use `--network host` instead and `localhost` in both URLs (then drop `-p`). The container doesn't run migrations; run `pnpm db:migrate` on the host first.

## 2. Env vars and secrets

Env is read and validated in one place, `app/lib/env.ts`. A missing or malformed var fails with its name, never its value.

| Var | What it is | Where it's set |
|---|---|---|
| `DATABASE_URL_TENANT` | App runtime: tenant pool, logs in as `app_tenant` (subject to RLS). | `.env`, `.env.test`, CI inline (`test` job), Vercel env (prod: Neon **pooled** URL, sensitive) |
| `DATABASE_URL_SYSTEM` | App runtime: system pool, logs in as `app_system` (`BYPASSRLS`). | `.env`, `.env.test`, CI inline (`test` job), Vercel env (prod: Neon **pooled** URL, sensitive) |
| `DB_QUERY_TIMEOUT_MS` | App runtime: time limit in ms for every query on both pools. Optional: default `10000`, must be a positive integer, max `600000`. Migrations aren't bound by it. | `.env` (optional), Vercel env (optional; leave unset for the default) |
| `DATABASE_URL_OWNER` | Migrate command: runs migrations as `neondb_owner`. | `.env`, `.env.test`, CI inline (`test` job), GitHub `production` environment secret (prod: Neon **direct** URL) |
| `APP_TENANT_PASSWORD` | Migrate command: the password it sets for `app_tenant`. Must match the password in `DATABASE_URL_TENANT`. | `.env`, `.env.test`, CI inline (`test` job), GitHub `production` environment secret |
| `APP_SYSTEM_PASSWORD` | Migrate command: the password it sets for `app_system`. Must match the password in `DATABASE_URL_SYSTEM`. | `.env`, `.env.test`, CI inline (`test` job), GitHub `production` environment secret |
| `VERCEL_TOKEN` | Deploy job: Vercel access token for the CLI. | GitHub `production` environment secret |
| `VERCEL_ORG_ID` | Deploy job: Vercel team (org) id. | GitHub `production` environment secret |
| `VERCEL_PROJECT_ID` | Deploy job: Vercel project id. | GitHub `production` environment secret |
| `VERCEL` | Set to `1` by `vercel build` (the CLI sets it itself). When set, the build applies the Vercel React Router preset (`react-router.config.ts`). | Set by Vercel only. Never set it locally or in Docker: the preset's output doesn't run under `react-router-serve`. |
| `PORT` | Port `react-router-serve` listens on (default `3000`). | `Dockerfile` (`3000`) |

The deploy-only secrets (`VERCEL_*` and the prod `DATABASE_URL_OWNER`) aren't in `.env.example`: they never exist on a dev machine.

## 3. Manual prerequisites before the first prod deploy

Do these in order. The deploy job fails until all of them are done.

### 3.1 Neon

1. Create a Neon project: region **AWS us-east-1 (N. Virginia)**, **Postgres 18**, **Free** plan. Keep the default database `neondb` and owner role `neondb_owner`.
2. Find the two connection strings in the project's **Connect** dialog (branch `main`, database `neondb`, role `neondb_owner`):
   - With **Connection pooling off**: the **direct** URL. Its host looks like `ep-<name>.us-east-1.aws.neon.tech`. This is `DATABASE_URL_OWNER`.
   - With **Connection pooling on**: the **pooled** host. It has `-pooler` after the endpoint id, like `ep-<name>-pooler.us-east-1.aws.neon.tech`. Note the host only; the app URLs are built from it in 3.2.
3. Choose two strong, different passwords for `app_tenant` and `app_system`, for example `openssl rand -base64 32 | tr -d '/+='`. Letters and digits only keep them URL-safe. Store them in your password manager.
4. **Never create `app_tenant` or `app_system` in the Neon Console, CLI or API.** The roles migration creates them as `neondb_owner` (ADR 0004). Roles made through Neon's tools join `neon_superuser`, and `app_tenant` must stay subject to RLS.
5. Check that Postgres won't log the role passwords. The migrate command runs `ALTER ROLE … PASSWORD '<password>'` in cleartext on every deploy, so statement logging must be off. In the Neon **SQL Editor** (as `neondb_owner`), run:

   ```sql
   SHOW log_statement;
   SHOW log_min_duration_statement;
   SHOW log_min_error_statement;
   ```

   - `log_statement` must be `none`. `ddl`, `mod` or `all` would write the `ALTER ROLE` statement, password included, to the Postgres log.
   - `log_min_duration_statement` must be `-1` (off). At `0` every statement is logged with its text.
   - `log_min_error_statement` should be `panic`. At the Postgres default (`error`), a statement that fails is logged with its text, so a failed `ALTER ROLE … PASSWORD` would log the password. If you can't change it, treat any migrate run that fails at the role step (the error names `ALTER ROLE` or a role) as a leaked password and rotate that role (section 5).
   - If `log_statement` or `log_min_duration_statement` is wrong, don't deploy. Change it in the Neon project settings if your plan allows it, or ask Neon support, then check again.

### 3.2 Vercel

1. Create a project on the **Pro** team, importing this GitHub repo. Framework preset: React Router (detected). Leave the build and install commands at their defaults.
2. **Settings → Functions**: region **Washington, D.C., USA (iad1)**, next to Neon's us-east-1. `vercel.json` sets the same.
3. **Settings → Build and Deployment** (older UI: **General**) **→ Node.js Version**: **24.x** (`engines` in `package.json` also pins it).
4. **Settings → Git**: turn Git auto-deploys and preview deployments off. `vercel.json` sets `git.deploymentEnabled: false`, which covers both, but check the project shows no deploy for a pushed branch. Deploys come only from the GitHub Actions `deploy` job, so a failed migration blocks the release.
5. **Settings → Environment Variables**, environment **Production**, each marked **Sensitive**:
   - `DATABASE_URL_TENANT` = `postgresql://app_tenant:<app_tenant password>@<pooled host>/neondb?sslmode=require`
   - `DATABASE_URL_SYSTEM` = `postgresql://app_system:<app_system password>@<pooled host>/neondb?sslmode=require`
   - `DB_QUERY_TIMEOUT_MS`: leave unset for the 10000 ms default. Set it (not sensitive) only to change the limit; values above `600000` fail at startup.
   - The app uses the **pooled** host (Neon's PgBouncer, transaction mode). The query limit is applied per transaction with `set_config('statement_timeout', …, true)`, which works through the pooler; a session-level `statement_timeout` would be rejected. The `/healthz` check in section 6 proves both pools work through it.
   - The `pg` driver may log a `SECURITY WARNING` about `sslmode=require`. It's harmless: the current driver treats `require` as full certificate verification.
6. Nothing to set for `VERCEL=1`: `vercel build` sets it itself, and that is what switches on the Vercel preset in `react-router.config.ts`. If a build ever comes out without the preset (a single `build/server/index.js`), look at the CLI version, not the project's system env var settings.
7. Create an access token under **Account Settings → Tokens**, scoped to the Pro team, for `VERCEL_TOKEN`. Pick an expiry and note it in your calendar: an expired token fails the deploy job at `vercel pull`.
8. Note the ids for the GitHub environment secrets (3.4): the team id (**Team Settings → General → Team ID**, `team_…`) is `VERCEL_ORG_ID`, and the project id (**Project Settings → General → Project ID**, `prj_…`) is `VERCEL_PROJECT_ID`.

### 3.3 Branch protection on `main`

Repo **Settings → Branches → Add branch ruleset** (or classic rule) for `main`:

1. Require a pull request before merging.
2. Require status checks to pass, and add `typecheck`, `lint`, `test` and `docker`. They show up in the picker once CI has run on a PR. `deploy` is not a required check: it only runs after the merge.
3. Block force pushes and deletion.

Do this before 3.4: once the prod secrets exist, any push that reaches `main` deploys with them.

### 3.4 GitHub `production` environment and its secrets

The prod secrets live on a GitHub **environment**, not on the repo. Repository secrets are readable by every workflow run from a same-repo branch, including a `pull_request` run whose `ci.yml` was edited on that branch, so the deploy job's `if` would be the only gate. An environment with a `main`-only branch policy holds its secrets back from every other branch.

1. Repo **Settings → Environments → New environment**, name it `production` (the `deploy` job uses `environment: production`).
2. Under **Deployment branches and tags**, choose **Selected branches and tags** and add `main` only.
3. In that environment, **Add environment secret** for each of these:

| Secret | Value |
|---|---|
| `DATABASE_URL_OWNER` | Neon **direct** URL for `neondb_owner` (3.1 step 2) |
| `APP_TENANT_PASSWORD` | `app_tenant` password (3.1 step 3), the same one inside `DATABASE_URL_TENANT` |
| `APP_SYSTEM_PASSWORD` | `app_system` password (3.1 step 3), the same one inside `DATABASE_URL_SYSTEM` |
| `VERCEL_TOKEN` | 3.2 step 7 |
| `VERCEL_ORG_ID` | 3.2 step 8 |
| `VERCEL_PROJECT_ID` | 3.2 step 8 |

**None of these may be repository secrets.** Check **Settings → Secrets and variables → Actions → Repository secrets** is empty of them, and delete any that are there.

GitHub masks secret values in job logs, and the workflow passes them only as env vars.

### 3.5 Domains (Vercel and GoDaddy)

`portal.neveslabs.dev` is the portal. `www.neveslabs.dev` and the apex `neveslabs.dev` belong to a future, separate business website. Until it exists, both redirect to the portal with a **temporary (307)** redirect. Never use 301 or 308: browsers cache permanent redirects, and the business site couldn't take the domains back from returning visitors.

1. Vercel project **Settings → Domains → Add**: `portal.neveslabs.dev`, connected to Production. This is the project's primary domain.
2. In GoDaddy **DNS → Manage DNS** for `neveslabs.dev`, add the record Vercel shows for `portal`: type `CNAME`, name `portal`, value as displayed by Vercel.
3. Vercel **Add**: `www.neveslabs.dev`. Choose **Redirect to Another Domain**, target `portal.neveslabs.dev`, status code **307 Temporary Redirect**.
4. Vercel **Add**: `neveslabs.dev`, again as a redirect to `portal.neveslabs.dev` with **307**. If Vercel offers to add `www` as well and redirect one to the other, decline: both must point at the portal.
5. In GoDaddy, add the records Vercel shows: `CNAME` named `www`, and an `A` record named `@` (apex), using the values Vercel displays. Remove GoDaddy's default parking `A` record for `@` and any forwarding on the domain, or they will fight Vercel's.
6. Wait for Vercel to show each domain as **Valid Configuration**. Vercel issues the TLS certificates itself.

**Handing `www` and the apex to the business site later:**

1. In this project's **Settings → Domains**, remove `www.neveslabs.dev` and `neveslabs.dev`.
2. In the business site's Vercel project, add both domains. If that site isn't on Vercel, point the GoDaddy `www` and `@` records at its host instead.
3. Update GoDaddy only if the new project shows different record values. `portal.neveslabs.dev` is untouched.

## 4. How a deploy works

Every push to `main` (a merged PR) runs `.github/workflows/ci.yml`:

1. `typecheck`, `lint`, `test` and `docker` run as on any PR.
2. Only if all four pass, the `deploy` job starts. It's in the `deploy-prod` concurrency group, so deploys queue and never cancel each other mid-migration.
3. **Migrate prod database**: `pnpm db:migrate` over the Neon **direct** URL as `neondb_owner`. It applies pending migrations, then re-asserts the role attributes and sets both role passwords from the `APP_*_PASSWORD` secrets.
4. `vercel pull --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod`, with the Vercel CLI run through `pnpm exec vercel`. The CLI is an exact-pinned devDependency (`vercel` in `package.json`, no caret), so the lockfile pins its whole dependency tree; bump it on purpose with `pnpm add -D -E vercel@<version>`. The Docker image's runtime stage installs prod deps only, so the CLI never ships in it. The job runs in the `production` environment, which is what gives it the secrets.

If the migrate step fails, the job stops and nothing is deployed: prod keeps serving the previous build on the previous schema. The log shows `db:migrate failed: <reason>`, without parameters or passwords. Fix forward: write a new migration (or fix the code) and merge it. Never edit a migration that prod has already applied. To retry without a code change (Neon was briefly down, a secret was wrong), re-run only the **latest** run on `main`, and only if it's the one that failed. If a newer run on `main` has deployed since, never re-run the older one: it would ship older code over newer. Fix forward instead.

The `deploy` job shows as skipped on PRs.

### If Neon refuses `BYPASSRLS`

`app_system` gets `BYPASSRLS` from the roles migration and from every migrate run. Neon lets `neondb_owner` grant it today (ADR 0004). If Neon ever refuses (the migrate step fails with a permission error on `CREATE ROLE` / `ALTER ROLE … BYPASSRLS`), don't work around it by hand. Apply the ADR 0004 fallback through a ticket:

- `app_system` becomes `NOBYPASSRLS`, in a new migration and in the migrate command's role attributes;
- every RLS table gets a permissive policy for `app_system`: `CREATE POLICY <table>_system ON <table> TO app_system USING (true) WITH CHECK (true);`, and every later table's migration adds the same;
- the RLS test that asserts `app_system` has `BYPASSRLS` is replaced by one asserting the policy lets it see every Client's rows.

Until that ships, nothing deploys, which is the safe state.

## 5. Rotating a role password

For `app_tenant` or `app_system`:

1. Choose a new password (3.1 step 3).
2. Update the `production` environment secret (`APP_TENANT_PASSWORD` or `APP_SYSTEM_PASSWORD`).
3. Update the matching Vercel env var (`DATABASE_URL_TENANT` or `DATABASE_URL_SYSTEM`) with the new password in the URL.
4. Re-run the deploy: **Actions → CI → latest run on `main` → Re-run jobs**, or merge any PR. The migrate step sets the new password, and the new deploy picks up the new URL.
5. Check `https://portal.neveslabs.dev/healthz` returns 200.
6. If the old password may have leaked, end the role's existing sessions: changing a password doesn't log out connections that are already authenticated (including PgBouncer's server connections). In the Neon SQL Editor, as `neondb_owner`, after the new deploy is live:

   ```sql
   select pg_terminate_backend(pid)
   from pg_stat_activity
   where usename = 'app_tenant'  -- or 'app_system'
     and pid <> pg_backend_pid();
   ```

   The live app reconnects with the new password on its next query.

Between step 4's migrate and the new deploy going live, the old deployment's pool still holds the old password, so new connections from it fail for a minute or two. Rotate at a quiet time.

For `neondb_owner`: reset its password in the Neon Console (**Roles → neondb_owner → Reset password**), then update the `DATABASE_URL_OWNER` environment secret. Nothing else uses it. If the old password may have leaked, reset first (that revokes it), then terminate its other sessions as above with `usename = 'neondb_owner'`.

For `VERCEL_TOKEN`: create a new token, update the environment secret, then delete the old token. If the old token may have leaked, delete it first, then create and store the new one.

## 6. Phase 1 prod walkthrough

After the first deploy, check each of these by hand:

1. `https://portal.neveslabs.dev` serves the token-styled placeholder over TLS (valid certificate, no browser warning), in dark tokens on a dark-mode system and light tokens on a light one.
2. `www.neveslabs.dev` and the apex return **307** to the portal:

   ```sh
   curl -sI https://www.neveslabs.dev | grep -iE '^(HTTP|location)'
   curl -sI https://neveslabs.dev     | grep -iE '^(HTTP|location)'
   ```

   Each must print `HTTP/2 307` and `location: https://portal.neveslabs.dev/`. A 301 or 308 is wrong: fix it in Vercel's domain settings.
3. `curl -s https://portal.neveslabs.dev/healthz` returns 200 with `{"ok":true}`. This proves both pooled URLs and role passwords work, and that the per-transaction query limit works through Neon's pooler. A 503 means one pool can't connect: check the Vercel `DATABASE_URL_*` passwords match the `production` environment secrets, then re-run the latest deploy.
4. In **Actions → CI → latest run on `main` → deploy**, the **Migrate prod database** step succeeded (`db:migrate: migrations applied, role attributes and passwords set`) before **Deploy to Vercel production** ran.

## 7. Adding to this runbook

Every Phase adds its settings here and to `.env.example` (roadmap gate 3): new env vars and secrets in section 2, new manual setup in section 3, new checks in a Phase walkthrough.
