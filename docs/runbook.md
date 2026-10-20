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

### Local QA

Use a normal Chrome user agent. Headless Chrome's default user agent is treated as a bot by the SSR entry, which disables streaming, so streamed loading states only show with a normal UA.

### Local GitHub sync

Board sync is off until the five `GITHUB_*` vars are set: Home says "GitHub isn't connected.", and Link and Sync now are hidden. Everything else works without it. To sync locally, use the **dev GitHub App**, never the prod one (its own private key and webhook secret).

1. **The dev App** on `Neves-Labs-Inc` (org **Settings → Developer settings → GitHub Apps**), with the prod App's permissions and events (3.8 step 1): Organization permission **Projects: Read**, repository permission **Issues: Read**, nothing else; events **Projects v2**, **Projects v2 item**, **Projects v2 status update**, **Issues**, **Milestone**. Unlike prod, install it on **Only select repositories**: just the repos whose issues are on the test board. Its deliveries pass through smee (step 2), so it must never see real client repos.
2. **The smee channel.** Open `https://smee.io/new` and keep the URL it gives you. It is the dev App's **Webhook URL**, and `SMEE_URL` in `.env`. **Keep `SMEE_URL` private, like a secret**: a smee channel has no auth, so anyone with the URL can watch every delivery (issue titles, bodies, assignees) and smee keeps recent ones. The webhook secret only proves deliveries are GitHub's; it hides nothing. Never paste the URL in chat or screenshots, and deactivate the dev App's webhook (**General → Webhook → Active**) when you aren't using it. Pick a webhook secret (`openssl rand -base64 32`) and set it both on the App and as `GITHUB_WEBHOOK_SECRET`.
3. **`.env`**: the dev App's `GITHUB_APP_ID` (its **General** page), `GITHUB_APP_PRIVATE_KEY` (a key generated on that page: the PEM between double quotes, newlines and all, or on one line with `\n` escapes), `GITHUB_APP_INSTALLATION_ID` (the number at the end of the installation's URL, org **Settings → GitHub Apps → Configure**), `GITHUB_WEBHOOK_SECRET`, `GITHUB_ORG=Neves-Labs-Inc` and `SMEE_URL`. Set all five `GITHUB_*` vars or none: the app names the missing ones and refuses to start. `CRON_SECRET` is optional locally.
4. Run both, in two terminals:

   ```sh
   pnpm dev            # the app, http://localhost:5173
   pnpm dev:webhooks   # forwards the smee channel to http://localhost:5173/webhooks/github
   ```

   Without `pnpm dev:webhooks`, nothing arrives by webhook. Sync now and the poll still work. Locally nothing runs the poll on a schedule (prod runs it daily), so run it by hand: set `CRON_SECRET` (at least 32 characters) and send a **GET** (a POST answers 405):

   ```sh
   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:5173/jobs/reconcile
   ```

   **Home's Unassigned GitHub boards panel starts empty.** It lists a cached pool of the org's boards that only the poll or a `projects_v2` webhook fills (any board edit with `pnpm dev:webhooks` running). On a fresh database, run the poll once as above, then reload Home.
5. **The test board**: an org-owned Projects v2 board (boards on a personal account send no webhooks) with the three required fields, names exact:
   - `Client visibility`, single select with the options `Visible` and `Internal`;
   - `Client note`, text;
   - `Target date`, date.

   Only issues (not drafts or PRs) whose `Client visibility` is `Visible` become Tasks. A board missing a field still syncs. The sync records a warning on the Project (`sync_warnings`), and the board detail page shows it (Phase 5).

Deliveries the dev server missed (it was off, or `pnpm dev:webhooks` wasn't running) are lost; the next Sync now or poll catches up. The App's **Advanced** tab lists recent deliveries and can redeliver one.

### Client board setup

Each Client's board starts from the org's **client board template** (a template never appears in the Link list). The sync reads three fields, and each must be a **project** field of the exact name and type, not an org **issue field**:

- `Client visibility`: single select with the options `Visible` and `Internal`;
- `Client note`: text;
- `Target date`: date.

An org issue field shows on the board like a column, but the sync reads only project field values, so no Task would sync. To spot it: the board detail's Required fields panel shows **Issue field** for that row, and the sync panel shows `<field> is an issue field; add it as a project field`. Fix it by adding the field to the board as a project field, then **Sync now**.

## 2. Env vars and secrets

Env is read and validated in one place, `app/lib/env.ts`. A missing or malformed var fails with its name, never its value. For the five `GITHUB_*` vars, `CRON_SECRET` and `SMEE_URL`, an empty value (`GITHUB_ORG=`) counts as unset.

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
| `CRON_SECRET` | App runtime: the secret Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>` to `/jobs/reconcile` (once a day, `vercel.json`). At least 32 characters; independent of the `GITHUB_*` group. Unset (or GitHub off), the job answers 503. **Required on prod.** | `.env` (optional), unset in `.env.test` and CI, Vercel env (prod: `openssl rand -base64 32`, sensitive) |
| `SMEE_URL` | Local only: the dev GitHub App's smee.io channel (its webhook URL). Read by `pnpm dev:webhooks`, which forwards deliveries to `http://localhost:5173/webhooks/github`; never read by the app. | `.env` (optional). Never on Vercel or CI. |
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

### 3.8 Phase 4 before prod deploy

Phase 4 adds the GitHub board sync. Without these vars the portal still starts, but sync is off (the webhook and the cron job answer 503), so set them before the Phase 4 deploy. All six are required on prod.

1. Create the **prod GitHub App** on `Neves-Labs-Inc` (org **Settings → Developer settings → GitHub Apps → New GitHub App**). It is separate from the dev App, with its own key and secret:
   - **Permissions**: Organization **Projects: Read** and repository **Issues: Read**. Metadata: Read is added automatically. Nothing else, and no write permission.
   - **Subscribe to events**: **Projects v2**, **Projects v2 item**, **Projects v2 status update**, **Issues**, **Milestone**.
   - **Webhook**: active, URL `https://portal.neveslabs.dev/webhooks/github`, with a secret you generate (`openssl rand -base64 32`). Store it in your password manager.
   - **Where can this GitHub App be installed?**: Only on this account.
2. On the App's **General** page, note the **App ID** and **Generate a private key** (a `.pem` downloads). Keep the file in your password manager and delete the download.
3. **Install App** on `Neves-Labs-Inc` with **All repositories**. The installation id is the number at the end of the installation's URL (org **Settings → GitHub Apps → Configure**).
4. Generate the cron secret: `openssl rand -base64 32`.
5. Vercel project **Settings → Environment Variables**, environment **Production**:

   | Var | Value | Sensitive |
   |---|---|---|
   | `GITHUB_APP_ID` | the App ID (step 2) | no |
   | `GITHUB_APP_PRIVATE_KEY` | the `.pem`'s contents, pasted as-is | yes |
   | `GITHUB_APP_INSTALLATION_ID` | the installation id (step 3) | no |
   | `GITHUB_WEBHOOK_SECRET` | the webhook secret (step 1) | yes |
   | `GITHUB_ORG` | `Neves-Labs-Inc` | no |
   | `CRON_SECRET` | the secret from step 4 | yes |

   Set the five `GITHUB_*` vars together: the app refuses to start with only some of them. `CRON_SECRET` is separate: unset, the cron job answers 503.
6. Nothing to set up for the cron itself: Vercel Cron reads `crons` from `vercel.json` on deploy (`/jobs/reconcile`, daily between 09:00 and 09:59 UTC on Hobby; webhooks are the primary sync path and this is the safety net, and Vercel Pro would allow `*/15`) and sends `Authorization: Bearer <CRON_SECRET>`. After the deploy, **Settings → Cron Jobs** lists it.
7. Move every client board still on a personal account (e.g. Vertilux Shade Calculator) to `Neves-Labs-Inc`: board webhooks fire only for org-owned boards.

### 3.9 Phase 5 before prod deploy

Phase 5 adds the Client User Overview, Projects list and Project view, the Admin's board detail and the sync-problem flag. It adds **no env vars or secrets** (`.env.example` is unchanged) and nothing to set up by hand. Its migration narrows `app_tenant` to column-level `SELECT` on the board tables and adds a restrictive policy that hides soft-hidden Tasks; CI applies it on deploy like any other (section 4).

The sync-problem flag assumes the daily cron: a linked board of an active Client is flagged when its last sync failed or it hasn't synced in over 26 hours. If Vercel Pro ever restores `*/15`, revisit that threshold (`SYNC_STALE_AFTER_MS` in `app/lib/board-sync/sync-problem.ts`).

### 3.10 Phase 6 before prod deploy

Phase 6 adds Requests: the Client User Requests pages and drawer, the Admin's inbox and triage, the Overview panel and the inbox alert icon. It adds **no env vars or secrets** (`.env.example` is unchanged) and nothing to set up by hand. Migration `0006_requests.sql` creates the `requests` table, its policies, grants and the `requests_status_changed_at` trigger; the usual migrate-gated deploy applies it (section 4).

Known follow-ups, found in review and not fixed:

- A live toast can cover the drawer footer when the drawer reopens right after a toast (the existing Toaster).
- If a linked Task is deleted and the Admin then saves the Request, `task_title` is cleared, so the "(no longer tracked)" snapshot is lost.
- The Overview and the Requests page duplicate the drawer, toast, highlight and focus logic.

### 3.11 Phase 7 before prod deploy

Phase 7 adds Invoices: the Admin's Invoices tab, New invoice drawer and Invoice detail with Mark paid, Revert and Void, the `receipt` alert icon and Home line for Overdue Invoices, the Client User Invoices pages, nav count, Overview panel and KPIs, and the same pages in the Admin preview. It adds **no env vars or secrets** (`.env.example` is unchanged) and nothing to set up by hand. Migration `0007_invoices.sql` creates the `invoices`, `line_items` and `invoice_counters` tables, their policies, grants and triggers; the usual migrate-gated deploy applies it (section 4). Invoice numbers start at `NL-0001-<year>` for each year with no counter row yet.

### 3.12 Phase 7b before prod deploy

Phase 7b adds the Admin's global Invoices page and detail (`/admin/invoices`, `/admin/invoices/:invoiceId`), the sidebar entry with its Overdue count, and a Client select on the New invoice drawer (Franklin, Phase 7b planning (2026-10-20)). It adds **no env vars or secrets** (`.env.example` is unchanged), **no migration** (no schema, grant or policy changes) and nothing to set up by hand: the usual deploy is enough. Each Client's Invoices tab is unchanged.

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

For the GitHub App private key (`GITHUB_APP_PRIVATE_KEY`):

1. On the App's **General** page, **Generate a private key**. An App can hold several keys, and the old one keeps working until you delete it.
2. Update `GITHUB_APP_PRIVATE_KEY` in Vercel (Production) with the new `.pem`'s contents.
3. Redeploy (re-run the latest run on `main`), then press **Sync now** on a linked board and check "Last synced" moves.
4. Delete the old key on the App's **General** page.

If the old key may have leaked, delete it first (sync fails until the redeploy; the next poll catches up), then do steps 1 to 3.

For the webhook secret (`GITHUB_WEBHOOK_SECRET`):

1. Generate a new secret (`openssl rand -base64 32`).
2. Update `GITHUB_WEBHOOK_SECRET` in Vercel (Production), then set the same secret on the App (**General → Webhook secret**) and redeploy right away. GitHub signs with the new secret at once, so until the new deploy is live each delivery gets a 401 and is dropped.
3. Change an item on a linked board and check "Last synced" moves within seconds. Anything missed in between is caught by the next daily run (or Sync now), or redeliver it from the App's **Advanced** tab.

For `CRON_SECRET`: generate a new one (`openssl rand -base64 32`), update it in Vercel (Production), then redeploy. Vercel Cron sends the deployment's current value, so nothing else changes. Check it in Vercel **Settings → Cron Jobs → Run** on `/jobs/reconcile`: the logs show it answering 200. A 401 there means the deployed value and the env var disagree: redeploy.

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

## 9. Phase 4 prod walkthrough

After the Phase 4 deploy (§3.8 done first), on `https://portal.neveslabs.dev` as the Admin. Use a test board on `Neves-Labs-Inc` with the three required fields (§1, "Local GitHub sync", step 5) and at least one issue on it, and a test Client, never a real client's.

1. The test board shows in Home's **Unassigned GitHub boards** panel. Right after the first Phase 4 deploy the panel is empty: the pool fills on the first daily run (Vercel Cron) or the first `projects_v2` webhook (any edit to an org board). Rather than wait, edit any org board (or press **Run** under Cron Jobs), then reload Home. Then create a new board on GitHub: it shows there within seconds (reload Home).
2. **Link** the test board to the test Client, mapping each of its columns. On the Client's **Projects & boards** tab it reads **Linked**, with a recent "Last synced".
3. On GitHub, set an item's `Client visibility` to `Visible` and change its Status. Reload the tab: "Last synced" moves within seconds (the webhook).
4. Close that item's issue. "Last synced" moves again (the `issues` event).
5. **Sync now** updates the time. Then press **Run** under Cron Jobs: the logs show `/jobs/reconcile` answering 200, and "Last synced" moves.
6. Add a Status column on GitHub, then **Sync now**: the row says "1 unmapped column". **Map columns**, map it and save: the line goes away.
7. **Unlink** (then confirm): the toast says "Board unlinked", the row reads "Unlinked <date>", and the board is back on Home. Link it to the same Client again: the same row reads **Linked** again.
8. **Delete** (then confirm): the toast says "Project deleted", the row is gone, and the board is back on Home.

If "Last synced" doesn't move after a GitHub change, check the App's **Advanced** tab: a 401 means the webhook secret differs from `GITHUB_WEBHOOK_SECRET` (§5), a 503 that a `GITHUB_*` var is missing. The row's "Last sync failed: …" line carries the sync's own error. Delete the test board and the test Client's Project when you're done.

## 10. Phase 5 walkthrough

After the Phase 5 deploy (§3.9), and locally with the qa-visual seed. Use a test Client with an Owner you can sign in as, and a linked test board (§9) with at least one Milestone, a few Tasks across statuses (one with no Milestone, one marked `Internal`) and a Status Update whose note has Markdown (a list, a link, an image).

1. **As a Client User** (the Owner): you land on **Overview**. The KPIs (Active projects, On track) match the Projects list. Open **Projects**: one row per Project. Open a **Project view**: the latest update's Markdown renders (the link opens in a new tab, the image shows as a link), the earlier updates form a timeline, and Tasks group by Milestone and status, with "Other work" last. The `Internal` Task is not there.
2. **On GitHub**, change an item's Status, and mark one visible item `Internal`. After the webhook (seconds), reload the Project view: the Status change shows, and the Internal Task is gone.
3. **As the Admin**: on the Client's **Projects & boards** tab, open the board's name. Check the Required fields, the Milestones, the Tasks (with the "<n> hidden" count matching the Internal ones) and **Sync now**.
4. **Sync problem**, locally: set `last_sync_error` on the Project (or age `last_synced_at` by 27 hours) in SQL:

   ```sql
   update projects set last_synced_at = now() - interval '27 hours' where id = '<project id>';
   ```

   Reload as the Admin: the Client's sidebar row shows the sync-problem icon (hover or focus the row for its tooltip), the tab row and the board detail show "Sync problem: …", and Home's Clients table shows "Sync problem" under the Client's name. **Sync now** clears all three. On prod, check only that a healthy board shows no icon; the flag itself is covered locally.

## 11. Phase 6 walkthrough

After the Phase 6 deploy (§3.10), and locally with the qa-visual seed. Use a test Client with an Owner and a Member you can sign in as, at least one Project, and a few Tasks. Locally, simulate Task states in SQL only; never click "Sync now" (`.env` holds real GitHub credentials). On prod, change Task visibility on GitHub.

1. **As a Member**, open **Requests** and submit a Bug with a Project. Check the toast, that it is the top row, and that the nav count is up by 1.
2. Open it and edit the title. Then submit a second Request and withdraw it: it shows Withdrawn with no controls.
3. **As an Owner** of the same Client: both Requests are visible, and the Owner has no edit or withdraw controls on the Member's.
4. **As the Admin**: the sidebar **Requests** count and the Client's `inbox` icon plus count show. Open the inbox (New filter), then All.
5. Triage the first Request to **Accepted**, link a Task and add a response note. As the Member: the status, the note, and the live Task with its status and Project link show. Edit and withdraw are gone.
6. **Hide the linked Task.** Locally, set `hidden_at` in SQL:

   ```sql
   update tasks set hidden_at = now() where id = '<task id>';
   ```

   On prod, mark the issue `Internal` on GitHub. The Request shows "<title> (no longer tracked)". Make it visible again (`set hidden_at = null`, or back to `Visible` on GitHub), and the Task shows live again.
7. **As the Admin**, move the Request to **Declined**. The link clears, and the Client sees Declined with no Task.
8. The Withdrawn Request is read-only in the Admin. An archived Client's Requests tab is read-only, and its Requests are absent from the inbox.
9. The **Overview** shows the Requests panel (5 newest, "View all" past 5), and "+ New" (aria-label "New request") works from there.

## 12. Phase 5a walkthrough

After the Phase 5a deploy, and locally with the qa-visual seed. Use a test Client with an Owner, a few linked boards (Projects) and Requests (one Task marked `Internal`), and an archived test Client. Locally, never click "Sync now" (`.env` holds real GitHub credentials).

1. **As the Admin**, open a Client and click **Preview** on each tab (Projects & boards, Team, Requests). Each opens the preview Overview in the same tab, under the banner "Previewing <Client> as an Owner · Read-only".
2. Check the Overview KPIs and panels, the Projects list, a Project view (the `Internal` Task is absent), the Requests list and a Request detail. No "New request", Edit, Withdraw, Team, Profile or Sign out shows. The "Admin preview" menu holds the theme toggle and Exit.
3. Click a link on each page (a Project row, a Request row, a Request's Project or Task link): you stay under `/admin/clients/<id>/preview`.
4. Click **Exit preview**: you land on the Client's Projects & boards tab.
5. Preview an archived Client: the banner adds "Archived: its users can't sign in".
6. Open the Link drawer on Home: the org's client board template is not listed. To fix an issue-field board, see [Client board setup](#client-board-setup).
7. Open the board detail of a board whose `Client visibility` is an org issue field: the Required fields panel shows **Issue field**, the sync panel shows `<field> is an issue field; add it as a project field`, and the meta counts it in "<n> to fix". No sync-problem icon appears for it.

Known follow-ups, found in review and not fixed:

- The Request detail's links are below the 44px touch target (issue #49).
- A document POST to a preview page gets a 405, but the preview layout's loader still runs its reads first (the Client lookup and the nav counts). Nothing is written.

## 13. Phase 7 walkthrough

After the Phase 7 deploy (§3.11), and locally with the qa-visual seed. Use a test Client with an Owner and a Member you can sign in as, and at least one Project. Locally, never click "Sync now" (`.env` holds real GitHub credentials). A Void Invoice is final in the database, so to repeat step 6 locally, recreate the throwaway database instead of resetting the row in SQL. On prod, numbers are global across Clients and Invoices can't be deleted, so the test Invoices stay for good and use up the first numbers of the year (and of the past year used in step 3); when you are done, revert any Paid one to Open, then void them all (only an Open Invoice can be voided).

1. **As the Admin**, open the test Client's **Invoices** tab: the empty state reads "No Invoices yet."
2. Click **+ New invoice**. Check the defaults (issue date today, due date 30 days later) and that the due date follows the issue date until you edit it. Add 3 lines, one of them negative, and check the live total. Then check the errors: a zero amount, a future issue date, and a negative total (the total must be more than $0.00). **Issue invoice**: the drawer closes, the toast reads "Invoice NL-000n-<year> issued", and the new row is highlighted.
3. Issue an Invoice with a past-year issue date. Its number uses that year's sequence (`NL-0001-<past year>` if none exists), not the current year's.
4. Issue one with a past due date. It shows Overdue. The Client's sidebar row shows the `receipt` icon ("Overdue Invoices", no count), and Home's Clients table shows "Overdue invoice" under the Client's name.
5. **As the Owner, and again as the Member**, check:
   - the **Invoices** nav entry and its open count (Open and Overdue Invoices);
   - the list, with the Overdue badge, and the detail with the memo, the Project link and the Line Items;
   - the **Overview** KPIs (Open balance, Overdue), and the Invoices panel beside the Requests panel at `xl`.
6. **As the Admin**, open an Open Invoice and **Mark paid** with a past paid date. First try a date before the issue date, and see the error. **Revert to Open**: the paid date clears. Mark it paid again. Then **Void invoice** another Open Invoice. As the Owner, the Void one is gone from the list, the detail ("Invoice not found.") and the Overview. As the Admin, it shows with the Void badge and "Voided <date>".
7. Pay or void the last Overdue Invoice: the `receipt` icon leaves the sidebar and the "Overdue invoice" line leaves Home.
8. **Admin preview** of the Client: the Invoices nav entry, list, detail, Overview panel and KPIs match the Owner's view, the Void Invoice is hidden, and no action shows.
9. **Archive** the Client: the Invoices tab has no "+ New invoice" and the detail has no actions. **Unarchive** it.

## 14. Phase 7b walkthrough

After the Phase 7b deploy (§3.12), and locally with the qa-visual seed. Use test Clients only: at least two active test Clients (one with a Project) and a third test Client with an Overdue Invoice, issued before you archive it (an archived Client can't take new Invoices; unarchive it when you are done). Spread Invoices over them: Open, Overdue, Paid and one in the past year. Locally, never click "Sync now" (`.env` holds real GitHub credentials), and seed `invoice_counters` (year, highest sequence used) if you insert Invoices directly, or the first create fails. A Void Invoice is final in the database, so to repeat step 8 locally, recreate the throwaway database. On prod, numbers are global across Clients and Invoices can't be deleted, so every test Invoice (the setup ones and step 5's) stays for good and uses up a number, the past-year one a past-year number; when you are done, revert any Paid one to Open, then void them all (step 8 voids one).

1. **As the Admin**, open **Invoices** in the sidebar (under Requests). The sidebar entry is current and shows an "overdue" count. The page lists every Client's Invoices, newest first, Void and the archived Client's included, the archived Client's name tagged "Archived". The panel meta reads "N invoices · open $X". At 375px the entry is a tab in the top row, without the count.
2. Try each filter and watch the URL change and the meta follow:
   - the **Open**, **Overdue**, **Paid** and **Void** tabs (Open includes the Overdue ones), and **All**;
   - **Client**: an active Client, then one from the "Archived" group;
   - **Issued**: a year (it lists only years that have Invoices), then **Custom range** with only From, only To, and both;
   - set **From after To**: "From must be on or before To." shows under the dates and the list ignores the range, other filters still apply;
   - **Number search**: a partial number ("0004") and a lowercase one ("nl-0004") both find NL-0004-<year>; `%` and `_` are literal, so they match nothing; the box stops at 20 characters;
   - combine two filters, switch a status tab (the other filters stay), then **Clear filters**.
3. Pick a filter that matches nothing: "No Invoices match these filters." with **Clear filters**. Edit the URL to `?status=nope&client=nope`: both are ignored and the controls show All and All clients.
4. Filter to an active test Client with at least one Project, then click **+ New invoice**. The drawer has a **Client** select first, with that Client chosen; the Project select lists its Projects. Change the Client: the Project resets to "No specific project" and lists the new Client's Projects. Clear the Client (choose the empty option) and **Issue invoice**: "Choose a client." Fix it.
5. Add a line and **Issue invoice**. The drawer closes, the toast reads "Invoice NL-000n-<year> issued", the filters stay, and the new row is highlighted (when the filters hide it, there is only the toast).
6. Open that Invoice from the list. The breadcrumb reads "Invoices / <Client name>" (the name links to the Client's Invoices tab). **Mark paid** with a past paid date, then **Revert to Open**. (If the Invoice is Overdue, the sidebar count follows each step.) Use the back link: you return to the filtered list, and the Invoice's number link takes focus.
7. Check the **Overdue** count: it matches the active Clients' Overdue Invoices, and does not count the archived Client's. The Overdue tab still lists the archived Client's Overdue Invoices.
8. Open the **archived Client's** Invoice: it has no Mark paid or Void, and reads "This Client is archived; its Invoices are read-only." under the header. Then open an Open Invoice (a throwaway one) and **Void invoice**: the detail shows the Void badge and "Voided <date>", and it appears under the **Void** tab.
9. Open `/admin/invoices/not-a-uuid`: "Invoice not found." with a link back to the list, inside the shell.
10. Each Client's own **Invoices** tab still works as in §13 (list, New invoice without a Client select, detail).

Known gaps, found in review and not fixed: none.

## 15. Adding to this runbook

Every Phase adds its settings here and to `.env.example` (roadmap gate 3): new env vars and secrets in section 2, new manual setup in section 3, new checks in a Phase walkthrough.
