# Runbook

How to run the portal locally, set up prod, and operate it. Prod is Vercel Pro (app) and Neon (Postgres), deployed from GitHub Actions (ADR 0004). The portal lives at `https://portal.neveslabs.dev`.

## 1. Local setup

Prerequisites: Node 24 (the version in `.nvmrc`; `nvm use` picks it up), Docker with Compose, and corepack (ships with Node).

```sh
corepack enable            # provides the pnpm version pinned in package.json
pnpm install
docker compose up -d       # Postgres 18 on 127.0.0.1:5432, Mailpit on 1025/8025
cp .env.example .env       # local-only values that match docker-compose.yml
pnpm db:migrate            # migrations as neondb_owner, then role passwords
pnpm dev                   # http://localhost:5173
```

- In `.env`, set `ADMIN_EMAIL` to the address you'll sign in with as the Admin. Magic links go only to that address.
- **Mailpit** catches every email the app sends locally (magic links, Invitations): open `http://localhost:8025` to read them. Nothing leaves your machine. Its SMTP port is `127.0.0.1:1025`, which `.env.example` points `SMTP_HOST` and `SMTP_PORT` at, with no auth.
- `docker compose up -d` runs `docker/postgres-init.sql` on first start. It creates the `neondb_owner` role (mirrors Neon's owner: `CREATEROLE`, `BYPASSRLS`, not superuser) and two databases: `client_dashboard` (dev) and `client_dashboard_test` (tests). To start from scratch, `docker compose down -v`.
- If `pnpm db:migrate` stops with `clients has N row(s) with no organization`, the database holds Clients left over from before Phase 2 (e.g. a crashed test run). Delete them as the owner (`delete from clients;`) and migrate again. Prod has none.
- `pnpm test` runs Vitest. Its global setup loads `.env.test` (vars already set in the shell win) and migrates `client_dashboard_test` before any suite runs. Postgres and Mailpit must be up (the mailer test sends to Mailpit and reads the message back through its API on `127.0.0.1:8025`), so ports 5432, 1025 and 8025 must be free for compose.
- Other checks, the same ones CI runs: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`.

Roles are cluster-wide, so the dev and test databases share `app_tenant` and `app_system`. The passwords in `.env` and `.env.test` must match, or each migrate resets the other's.

### Docker image

The `Dockerfile` builds the same app that Vercel serves, so the later AWS move is a redeploy (ADR 0004). CI builds it on every PR.

```sh
docker build -t client-dashboard .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL_TENANT=postgres://app_tenant:app_tenant_local@host.docker.internal:5432/client_dashboard \
  -e DATABASE_URL_SYSTEM=postgres://app_system:app_system_local@host.docker.internal:5432/client_dashboard \
  -e BETTER_AUTH_SECRET=local-only-better-auth-secret-change-me-0123456789 \
  -e BETTER_AUTH_URL=http://localhost:3000 \
  -e ADMIN_EMAIL=admin@example.com \
  -e SMTP_HOST=host.docker.internal \
  -e SMTP_PORT=1025 \
  -e MAIL_FROM=portal@localhost.test \
  client-dashboard
```

Then open `http://localhost:3000` and `http://localhost:3000/healthz`. `host.docker.internal` is Docker Desktop's name for the host. On Linux it would reach the bridge IP, but compose binds Postgres and Mailpit to `127.0.0.1` only, so use `--network host` instead and `localhost` in the URLs and `SMTP_HOST` (then drop `-p`). The container doesn't run migrations; run `pnpm db:migrate` on the host first.

Off Vercel the app ignores `X-Forwarded-For` (anyone can set it), so the sign-in rate limits share one bucket per path for every client: 5 magic-link requests a minute in total. That is safe, only tighter. Before self-hosting for real, behind a proxy that overwrites the header, change `trustForwardedFor` in `app/lib/auth/auth.server.ts` through a ticket.

## 2. Env vars and secrets

Env is read and validated in one place, `app/lib/env.ts`. A missing or malformed var fails with its name, never its value.

| Var | What it is | Where it's set |
|---|---|---|
| `DATABASE_URL_TENANT` | App runtime: tenant pool, logs in as `app_tenant` (subject to RLS). | `.env`, `.env.test`, CI inline (`test` job), Vercel env (prod: Neon **pooled** URL, sensitive) |
| `DATABASE_URL_SYSTEM` | App runtime: system pool, logs in as `app_system` (`BYPASSRLS`). | `.env`, `.env.test`, CI inline (`test` job), Vercel env (prod: Neon **pooled** URL, sensitive) |
| `DB_QUERY_TIMEOUT_MS` | App runtime: time limit in ms for every query on both pools. Optional: default `10000`, must be a positive integer, max `600000`. Migrations aren't bound by it. | `.env` (optional), Vercel env (optional; leave unset for the default) |
| `BETTER_AUTH_SECRET` | App runtime: Better Auth's signing secret (session cookies). At least 32 characters. Rotating it signs everyone out (section 5). | `.env`, `.env.test`, CI inline (`test` job), Vercel env (prod: `openssl rand -base64 32`, sensitive) |
| `BETTER_AUTH_URL` | App runtime: the portal's public origin, with no trailing slash or path. Must be `https`, except `http` on `localhost` / `127.0.0.1`. Drives cookies, trusted origins, the passkey `rpID` (its hostname) and `origin`, and the links in emails. | `.env`, `.env.test`, CI inline (`test` job), Vercel env (prod: `https://portal.neveslabs.dev`) |
| `ADMIN_EMAIL` | App runtime: the Admin's email, compared case-insensitively. It signs in by magic link (to register a passkey) and passkey only, never Google, and can never be invited. | `.env` (your own address), `.env.test`, CI inline (`test` job), Vercel env (sensitive) |
| `SMTP_HOST` | App runtime: SMTP server for all email. | `.env` / `.env.test` (`localhost`, Mailpit), CI inline (`test` job), Vercel env (prod: `smtp.gmail.com`) |
| `SMTP_PORT` | App runtime: SMTP port, 1–65535. Port `465` means implicit TLS; any other port is plain. | `.env` / `.env.test` (`1025`, Mailpit), CI inline (`test` job), Vercel env (prod: `465`) |
| `SMTP_USER` | App runtime: SMTP login. Optional, but set together with `SMTP_PASSWORD` or not at all. | Unset locally and in CI (Mailpit needs no auth). Vercel env (prod: the dedicated Gmail account, sensitive) |
| `SMTP_PASSWORD` | App runtime: SMTP password. Optional, but set together with `SMTP_USER` or not at all. When set, `SMTP_PORT` must be `465`, so the credentials never cross a plain connection. | Unset locally and in CI. Vercel env (prod: the dedicated Gmail account's app password, sensitive) |
| `GOOGLE_CLIENT_ID` | App runtime: the Google OAuth client id for Client User sign-in. Set together with `GOOGLE_CLIENT_SECRET` or not at all; unset, Google sign-in is off and its button is hidden. **Required on prod.** | `.env` (Franklin's dev client, optional), unset in `.env.test` and CI, Vercel env (prod, not sensitive) |
| `GOOGLE_CLIENT_SECRET` | App runtime: that client's secret. Set together with `GOOGLE_CLIENT_ID` or not at all. Rotation: section 5. **Required on prod.** | `.env` (optional), unset in `.env.test` and CI, Vercel env (prod, sensitive) |
| `GITHUB_APP_ID` | App runtime: the read-only GitHub App's id. The five `GITHUB_*` vars are set together or not at all (validation names the missing ones); unset, board sync is off. **Required on prod.** | `.env` (the dev App's, optional), unset in `.env.test` and CI, Vercel env (prod App's, not sensitive) |
| `GITHUB_APP_PRIVATE_KEY` | App runtime: the App's private key PEM, multiline as-is. Literal `\n` escapes (some env UIs flatten newlines) are turned back into newlines. **Required on prod.** | `.env` (optional), unset in `.env.test` and CI, Vercel env (prod, sensitive) |
| `GITHUB_APP_INSTALLATION_ID` | App runtime: the App's installation id on the org, a positive integer. **Required on prod.** | `.env` (optional), unset in `.env.test` and CI, Vercel env (prod, not sensitive) |
| `GITHUB_WEBHOOK_SECRET` | App runtime: the secret GitHub signs the App's webhook deliveries with. **Required on prod.** | `.env` (optional), unset in `.env.test` and CI, Vercel env (prod, sensitive) |
| `GITHUB_ORG` | App runtime: the org login whose Projects v2 boards are read, `Neves-Labs-Inc`. **Required on prod.** | `.env` (optional), unset in `.env.test` and CI, Vercel env (prod, not sensitive) |
| `MAIL_FROM` | App runtime: sender address. The display name is always "Neves Labs". | `.env` / `.env.test` (`portal@localhost.test`), CI inline (`test` job), Vercel env (prod: the dedicated Gmail address) |
| `DATABASE_URL_OWNER` | Migrate command: runs migrations as `neondb_owner`. | `.env`, `.env.test`, CI inline (`test` job), GitHub `production` environment secret (prod: Neon **direct** URL) |
| `APP_TENANT_PASSWORD` | Migrate command: the password it sets for `app_tenant`. Must match the password in `DATABASE_URL_TENANT`. | `.env`, `.env.test`, CI inline (`test` job), GitHub `production` environment secret |
| `APP_SYSTEM_PASSWORD` | Migrate command: the password it sets for `app_system`. Must match the password in `DATABASE_URL_SYSTEM`. | `.env`, `.env.test`, CI inline (`test` job), GitHub `production` environment secret |
| `VERCEL_TOKEN` | Deploy job: Vercel access token for the CLI. | GitHub `production` environment secret |
| `VERCEL_ORG_ID` | Deploy job: Vercel team (org) id. | GitHub `production` environment secret |
| `VERCEL_PROJECT_ID` | Deploy job: Vercel project id. | GitHub `production` environment secret |
| `VERCEL` | Set to `1` by `vercel build` (the CLI sets it itself). When set, the build applies the Vercel React Router preset (`react-router.config.ts`). Vercel also sets it at run time, and only then does the auth module trust `X-Forwarded-For` (Vercel overwrites it with the client IP) for rate limits. | Set by Vercel only. Never set it locally or in Docker: the preset's output doesn't run under `react-router-serve`. |
| `PORT` | Port `react-router-serve` listens on (default `3000`). | `Dockerfile` (`3000`) |

The deploy-only secrets (`VERCEL_*` and the prod `DATABASE_URL_OWNER`) aren't in `.env.example`: they never exist on a dev machine.

## 3. Manual prerequisites before the first prod deploy

Do these in order. The deploy job fails until all of them are done.

### 3.1 Neon

1. Create a Neon project: region **AWS us-east-1 (N. Virginia)**, **Postgres 18**, **Free** plan. Keep the default database `neondb` and owner role `neondb_owner`.
2. Find the two connection strings in the project's **Connect** dialog (branch `main`, database `neondb`, role `neondb_owner`):
   - With **Connection pooling off**: the **direct** URL. Its host looks like `ep-<name>.c-<n>.us-east-1.aws.neon.tech`. This is `DATABASE_URL_OWNER`, with the query string replaced by `?sslmode=verify-full` (Neon's copy ends in `?sslmode=require&channel_binding=require`).
   - With **Connection pooling on**: the **pooled** host. It has `-pooler` after the endpoint id, like `ep-<name>-pooler.c-<n>.us-east-1.aws.neon.tech`. Note the host only; the app URLs are built from it in 3.2.
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
   - `DATABASE_URL_TENANT` = `postgresql://app_tenant:<app_tenant password>@<pooled host>/neondb?sslmode=verify-full`
   - `DATABASE_URL_SYSTEM` = `postgresql://app_system:<app_system password>@<pooled host>/neondb?sslmode=verify-full`
   - `DB_QUERY_TIMEOUT_MS`: leave unset for the 10000 ms default. Set it (not sensitive) only to change the limit; values above `600000` fail at startup.
   - The app uses the **pooled** host (Neon's PgBouncer, transaction mode). The query limit is applied per transaction with `set_config('statement_timeout', …, true)`, which works through the pooler; a session-level `statement_timeout` would be rejected. The `/healthz` check in section 6 proves both pools work through it.
   - `<pooled host>` is the real host from 3.1 step 2, never the literal placeholder: a wrong host fails `/healthz` with `getaddrinfo ENOTFOUND`.
   - Use `sslmode=verify-full`, not `require`: `pg` warns that `require` will drop to libpq's weaker meaning (encrypt, don't verify) in its next major version. Neon's certificates are publicly trusted, so `verify-full` needs no extra setup.
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

`portal.neveslabs.dev` is the portal. `www.neveslabs.dev` and the apex `neveslabs.dev` belong to the separate business website: repo `neveslabs-site`, deployed by its own Vercel project through Vercel's Git integration (a static "Coming soon" placeholder for now). Neither domain is attached to the portal's project.

1. Vercel project **Settings → Domains → Add**: `portal.neveslabs.dev`, connected to Production. This is the project's primary domain.
2. In GoDaddy **DNS → Manage DNS** for `neveslabs.dev`, add the record Vercel shows for `portal`: type `CNAME`, name `portal`, value as displayed by Vercel.
3. Wait for Vercel to show the domain as **Valid Configuration**. Vercel issues the TLS certificate itself.

**Business site domains** (in the `neveslabs-site` Vercel project, not this one):

1. **Settings → Domains → Add**: `www.neveslabs.dev`, connected to Production. This is the site's primary domain.
2. **Add**: `neveslabs.dev`. Choose **Redirect to Another Domain**, target `www.neveslabs.dev`, status code **308 Permanent Redirect**.
3. In GoDaddy, add the records Vercel shows: `CNAME` named `www`, and an `A` record named `@` (apex). Remove GoDaddy's default parking `A` record for `@` and any forwarding on the domain, or they will fight Vercel's.
4. If either domain is still attached to the portal's project (the Phase 1 setup redirected both to the portal), remove it there first, or Vercel won't let the site's project add it.

### 3.6 Phase 2 before prod deploy

Phase 2 adds sign-in and email. The app fails at startup until all eight vars below exist, so set them before the first Phase 2 deploy.

1. Generate the Better Auth secret: `openssl rand -base64 32`. Store it in your password manager.
2. Vercel project **Settings → Environment Variables**, environment **Production**:

   | Var | Value | Sensitive |
   |---|---|---|
   | `BETTER_AUTH_SECRET` | the secret from step 1 | yes |
   | `BETTER_AUTH_URL` | `https://portal.neveslabs.dev` | no |
   | `ADMIN_EMAIL` | the Admin's email | yes |
   | `SMTP_HOST` | `smtp.gmail.com` | no |
   | `SMTP_PORT` | `465` | no |
   | `SMTP_USER` | the dedicated Gmail account | yes |
   | `SMTP_PASSWORD` | that account's app password | yes |
   | `MAIL_FROM` | the dedicated Gmail address | yes |

   `SMTP_PORT` must be `465` (implicit TLS) whenever `SMTP_PASSWORD` is set; the app refuses to start otherwise.
3. Confirm `neveslabs.dev` receives no mail: `dig MX neveslabs.dev +short` must print nothing. Mail is sent from the Gmail address, never from the domain.

### 3.7 Phase 3 before prod deploy

Phase 3 adds Client User sign-in with Google. Without these two vars the portal still starts, but Google sign-in is off, so set them before the Phase 3 deploy.

1. Vercel project **Settings → Environment Variables**, environment **Production**:

   | Var | Value | Sensitive |
   |---|---|---|
   | `GOOGLE_CLIENT_ID` | the Google OAuth client's id | no |
   | `GOOGLE_CLIENT_SECRET` | that client's secret | yes |

   Set both or neither: the app refuses to start with only one.
2. In Google Cloud Console (**APIs & Services → Credentials →** the OAuth client), confirm the two authorized redirect URIs are exactly `http://localhost:5173/api/auth/callback/google` and `https://portal.neveslabs.dev/api/auth/callback/google`.
3. In **OAuth consent screen**, confirm the publishing status is **In production**. While it is **Testing**, only the listed test users can sign in, and anyone else gets Google's own error page.

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

## 5. Rotating passwords and secrets

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

For `BETTER_AUTH_SECRET`: generate a new one (`openssl rand -base64 32`), update the Vercel env var, then redeploy (re-run the latest run on `main`). **Rotating it signs everyone out**: every session cookie was signed with the old secret. The Admin signs in again with the passkey.

For the Google OAuth client secret (`GOOGLE_CLIENT_SECRET`):

1. In Google Cloud Console (**APIs & Services → Credentials →** the OAuth client), add a new secret. The old one keeps working until you disable it.
2. Update `GOOGLE_CLIENT_SECRET` in Vercel (Production).
3. Redeploy (re-run the latest run on `main`), then sign in with Google to check it works.
4. Disable, then delete, the old secret in the console.

If the old secret may have leaked, disable it first (Google sign-in fails until the redeploy), then do steps 1 to 3. Signed-in sessions aren't affected: the secret is only used during sign-in.

For the Gmail app password (`SMTP_PASSWORD`):

1. In the dedicated Gmail account, create a new app password.
2. Update `SMTP_PASSWORD` in Vercel (Production).
3. Redeploy (re-run the latest run on `main`), then request a magic link to check mail still arrives.
4. Revoke the old app password in the Gmail account.

If the old app password may have leaked, revoke it first (mail stops until the redeploy), then do steps 1 to 3.

### Magic links stop arriving: the hourly cap

Each address (`ADMIN_EMAIL` and every Client User or invitee) gets at most 10 magic links per hour, whatever IPs ask for them. Once the cap is spent, the sign-in screen still says "Check your email" but nothing is sent, and the Vercel function logs show `auth: magic-link email skipped (hourly cap reached)`. That line means someone (you, or anyone who knows the address) burned the 10/hour cap. If you didn't send the requests, someone is trying to mail-bomb the address.

To recover:

- **Sign in with your passkey.** It doesn't use email, so the cap doesn't affect it.
- Or wait for the window to end: the cap resets an hour after the first link of the window.
- Or, if you need a link now, clear the counter in the Neon SQL Editor as `neondb_owner`: `delete from email_send_quota where key like 'magic-link:%';`. Do this only once the requests have stopped, or the cap just fills again.

## 6. Phase 1 prod walkthrough

After the first deploy, check each of these by hand:

1. `https://portal.neveslabs.dev` serves the token-styled placeholder over TLS (valid certificate, no browser warning), in dark tokens on a dark-mode system and light tokens on a light one.
2. `www.neveslabs.dev` serves the business site, and the apex redirects to it:

   ```sh
   curl -sI https://www.neveslabs.dev | grep -iE '^(HTTP|location)'
   curl -sI https://neveslabs.dev     | grep -iE '^(HTTP|location)'
   ```

   The first must print `HTTP/2 200`; the second `HTTP/2 308` and `location: https://www.neveslabs.dev/`. A redirect to the portal means the domain is still attached to the portal's Vercel project: move it per §3.5.
3. `curl -s https://portal.neveslabs.dev/healthz` returns 200 with `{"ok":true}`. This proves both pooled URLs and role passwords work, and that the per-transaction query limit works through Neon's pooler. A 503 means one pool can't connect: check the Vercel `DATABASE_URL_*` passwords match the `production` environment secrets, then re-run the latest deploy.
4. In **Actions → CI → latest run on `main` → deploy**, the **Migrate prod database** step succeeded (`db:migrate: migrations applied, role attributes and passwords set`) before **Deploy to Vercel production** ran.

## 7. Phase 2 prod walkthrough

After the first Phase 2 deploy, on `https://portal.neveslabs.dev` (not a preview or `*.vercel.app` URL: there, sign-out answers 403 by design, because the Origin check compares against `BETTER_AUTH_URL`):

1. On `/sign-in`, request a magic link for `ADMIN_EMAIL`, and check it **arrives in Gmail** within a minute. The email is sent in the background after the response (`waitUntil`), so a dropped send shows only here and in the Vercel function logs (`auth: magic-link email failed (…)`). Open the link.
2. Register a passkey on the "Register a passkey" screen. You land on Admin Home, signed in with it.
3. Sign out from the user menu, then on `/sign-in` choose **Sign in with a passkey**. You're back on Admin Home.
4. Create a Client with **New client**. You land on its Team tab with the "Invite first Owner" drawer open.
5. Invite a first Owner at one of your own test addresses (never a real client's). The toast says "Invitation sent", the row shows under Pending invitations, Home's Owner column says "Invitation pending", and the email "You're invited to <Client> on the Neves Labs portal" arrives.
6. Open the email's link (`https://portal.neveslabs.dev/invitations/<id>`). It showed "Page not found" in Phase 2; from Phase 3 it opens the acceptance page ("Join <Client>"), where signing in as the invited email joins.
7. **Resend**: a second, identical email arrives with the same link. **Revoke** (then confirm): the row disappears and "Invite first Owner" returns.

If an invitation email doesn't arrive, the action still reports success (the Invitation is saved, so you can resend). The Vercel function logs show `auth: invitation email failed (<error name and code>)`, with the Client's id but no address or link; check the `SMTP_*` vars, then resend.

## 8. Phase 3 prod walkthrough

After the Phase 3 deploy (§3.7 done first), on `https://portal.neveslabs.dev`. Use test addresses you own, never a real client's: one Gmail address for the first Owner (it must be a Google account, to test Google), a second for the Member, and a third Google account that is never invited. Use a second browser profile (or a private window) for the Member.

1. As the Admin, create a Client and invite the first Owner's Gmail address (§7, steps 4 and 5). The invitation email arrives in Gmail.
2. Open the email's link signed out. The page says "Join <Client>" and shows **Continue with Google** and **Email me a sign-in link**. Choose **Continue with Google** with the invited Gmail account. You land on `/team` as an Owner.
3. Sign out from the user menu. On `/sign-in`, request a magic link for the same address and check it **arrives in Gmail**. Open it: you land on `/team` again, with no second account created.
4. Sign out. On `/sign-in`, request a magic link for an address nobody invited: the check-your-email page appears, but nothing arrives. Then choose **Continue with Google** with the **uninvited** Google account. You land on "No access", and the Admin's Home shows no new user.
5. While signed in as the Owner, open an invitation link addressed to a different email (create one for a fourth address). The page says the invitation is for that address and offers **Sign out**.
6. As the Owner, **Invite teammate** with the Member's address. The email reads "<name> (<your email>) invited you to join <Client>…". Open it in the second browser profile and join (by Google or by magic link). The Member lands on `/team` with a read-only roster: no invite, role or remove controls.
7. As the Admin, open the Client's **Team** tab. It lists both users with their role and remove controls, and the Owner's pending invitations.
8. As the Owner, **Make Owner** on the Member (the toast says "Role updated"), then **Make Member** again. Your own row has no controls.
9. As the Owner, **Remove** the Member and confirm. In the Member's browser profile, the next page load sends them to `/sign-in`: they are signed out.
10. Invite the Member again and let them rejoin. Then, in the Member's profile, open **Profile** from the user menu. Rename yourself: the toast says "Name saved" and the sidebar shows the new name. Google reads "Linked" if the Member joined with Google, otherwise "Not linked".
11. As the Owner (the only Owner, with the Member still on the team), open **Profile**. **Leave** is disabled, with "You're the only Owner. Make someone else an Owner first."
12. As the Member, **Leave** from Profile and confirm. You land on `/sign-in` with "You left your Client." (a reload no longer shows it). The Owner's roster no longer lists them.
13. As the Admin, open the Client and choose **Archive client**, then confirm. The Client moves to the **Archived** group in the sidebar. In the Owner's browser profile the next page load signs them out, and both **Continue with Google** and a magic link then show "no longer has access".
14. As the Admin, **Unarchive** the Client. It leaves the Archived group. The Owner signs in again by Google and by magic link, and lands on `/team`.

If a magic link or invitation email doesn't arrive, see §5 ("Magic links stop arriving") and §7. If Google sign-in shows Google's own error page, the OAuth consent screen is still in Testing or the redirect URI is wrong (§3.7).

## 9. Adding to this runbook

Every Phase adds its settings here and to `.env.example` (roadmap gate 3): new env vars and secrets in section 2, new manual setup in section 3, new checks in a Phase walkthrough.
