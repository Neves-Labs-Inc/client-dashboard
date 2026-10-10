# Stack, DB and hosting for an Auth.js multi-tenant portal

Resolves research ticket #3 (map #1). Researched 2026-10-09 against official docs, pricing pages and npm registry data.

Scale assumed: ~10 **Clients**, ~50 **Client Users**, one **Admin**. Needs: Auth.js (self-hosted), per-Client data isolation, PM-tool sync (GitHub webhooks plus a periodic reconcile), private storage for invoice PDFs, low cost, low ops.

## WARNING: Auth.js is in maintenance mode

Auth.js was a fixed constraint at charting. It carries a material risk that should be re-confirmed before it is locked in:

- **Since 2025-09-22, Better Auth maintains Auth.js.** The announcement promises "security patches and urgent issues" for existing users and "strongly recommend[s] new projects to start with Better Auth". Better Auth itself joined Vercel in July 2026. [1][2]
- **authjs.dev now shows the banner "The Auth.js project is now part of Better Auth"** and has a "Migrate to Better Auth" guide. [3]
- **v5 never left beta.** `next-auth@latest` is still 4.24.15. v5 is `5.0.0-beta.32`, and the authjs.dev install docs use `next-auth@beta`. Releases come about every 3 months: beta.30 in 2025-10, beta.31 in 2026-04, beta.32 in 2026-07. The repo has about 600 open issues. [4][5]
- **Framework support is already slipping.** `@auth/sveltekit` declares support for `@sveltejs/kit ^1 || ^2`. SvelteKit 3.0.0 shipped on 2026-10-01 and is not covered. [4]
- **No official React Router / Remix integration exists.** The officially listed frameworks are Next.js, SvelteKit, Express and Qwik. [3]

What this means: Auth.js still works and still gets security fixes, so it is usable. But the project is being wound down in favour of Better Auth, which is also self-hosted, TypeScript, and uses your own DB. **Recommendation:** open a short decision ticket, "Auth.js vs Better Auth". All three combinations below work with either library, because both store sessions in your Postgres.

If Auth.js stays, reduce the risk this way:
- Use Next.js, its best-supported framework.
- Pin exact versions.
- Use the Drizzle or Prisma adapter with database sessions.
- Keep auth calls behind one module (`auth()` / `signIn`), so a later swap is contained.

## Shortlist

All three use **Next.js 16 (App Router) + TypeScript/React + Postgres + Drizzle (or Prisma)**. That matches the owner's style. It is also the only framework where Auth.js is first-class today.

1. **Next.js on Vercel Pro + Neon Postgres + Vercel Blob (private)**: the recommended default.
   - About **$20/mo**: Vercel Pro, with Blob and function usage covered by the $20 credit. Neon fits the free plan.
   - Lowest ops: git-push deploys, preview deploys with Neon branches.
   - PM sync: a webhook route handler, plus Vercel Cron for reconcile (per-minute on Pro).
   - Invoice PDFs: a private Blob store, streamed through an auth-checked route.
2. **Next.js on Vercel Pro + Supabase (Postgres + Storage only)**:
   - About **$45/mo**: Vercel Pro $20 + Supabase Pro $25. The Supabase free tier pauses after 1 week of inactivity, which is a poor fit for a low-traffic real portal.
   - Choose this if you want a dashboard/table editor and S3-style Storage with signed URLs from the same vendor.
   - Use Supabase only as Postgres + Storage, with the Drizzle/pg adapter. **Do not** use `@auth/supabase-adapter`: it is community-maintained, needs the service-role key, and has you mint Supabase JWTs.
3. **Next.js (Node `standalone`) on Fly.io + Neon (or Fly Managed Postgres) + Tigris**:
   - About **$7/mo** for a 1 GB shared machine, plus a DB that is $0 on Neon free or $38+ on Fly Managed Postgres.
   - A long-running Node process can run an in-process job queue (e.g. a Postgres-backed queue) for sync.
   - Less vendor lock-in, but more ops: Dockerfile, machine sizing, no built-in preview environments.

Ruled out:
- **SvelteKit:** `@auth/sveltekit` doesn't yet support SvelteKit 3, and it is off the owner's React style.
- **React Router v7 / Remix:** no official Auth.js integration.
- **AWS (RDS + ECS/Amplify):** the most ops and an always-on DB instance cost, with no benefit at ~50 users.

## Comparison

| | 1. Vercel + Neon + Blob | 2. Vercel + Supabase | 3. Fly + Neon/Fly PG + Tigris |
|---|---|---|---|
| Auth.js fit | Next.js, first-class. `@auth/neon-adapter`, `@auth/drizzle-adapter` and `@auth/pg-adapter` are all official [6] | Next.js. Use `@auth/drizzle-adapter`/`pg-adapter` against Supabase Postgres. `@auth/supabase-adapter` is community, service-role key [7] | Next.js on Node. Same adapters as option 1 |
| Tenant isolation | App-level scoping by `client_id` in one data-access module. Optional Postgres RLS: Neon supports standard `CREATE POLICY` [8] | Same, plus mature RLS tooling. Supabase's JWT/`auth.uid()` RLS doesn't apply to Auth.js sessions without extra JWT minting [7] | Same as option 1 |
| PM sync / jobs | Webhook route handler. Vercel Cron: 100 jobs/project, per-minute on Pro, daily only on Hobby [9] | Same as option 1 (Supabase also has pg_cron and Edge Functions) | Always-on process: in-process queue or cron. No serverless time limits |
| Invoice PDFs | Vercel Blob **private** store: reads need a token and are delivered through your Function, which fits an auth-gated route [10] | Supabase Storage: 100 GB in Pro [11] | Tigris (S3-compatible), billed on the Fly invoice [12] |
| DB cost | Neon Free: 1 GB/project, 100 CU-hours, scales to zero after 5 min, no paid minimum. Launch plan $0.106/CU-h, $0.35/GB-mo [13] | Free: 500 MB, pauses after 1 week idle. Pro from $25/mo with $10 compute credit and 8 GB disk [11] | Neon as option 1, or Fly Managed Postgres Basic $38/mo + $0.28/GB [12] |
| Hosting cost | **Vercel Pro $20/mo** including $20 credit. Hobby is **non-commercial only**, and a paid client portal is commercial [14][15] | Vercel Pro $20/mo | shared-cpu-1x: $2.19 (256 MB), $3.69 (512 MB), $6.70 (1 GB) per month. No free tier [12] |
| Est. total/mo | ~$20 | ~$45 | ~$7 to $45 |
| Ops burden | Lowest | Low (two dashboards) | Medium (Docker, machines, backups if self-run) |
| Lock-in | Medium (Blob, Cron are Vercel APIs) | Medium | Low |

Notes:
- **Neon** is now owned by Databricks. Its tech underpins Databricks "Lakebase", and the pricing page uses that name. Neon still runs as a standalone developer platform. [13][16]
- **Vercel Blob private** files cost Blob Data Transfer when the Function fetches them, and then Fast Data Transfer on the response. Both are negligible at this scale. Signed URLs are also available. [10]
- **Tenant isolation:** this works the same on every option. Scope every query through a single tenant-aware data layer that takes `clientId` from the session. RLS is an optional second layer: set `SET LOCAL app.client_id` in each transaction, with a policy on `current_setting(...)`. Make this call in the separate isolation ticket.

## Sources

1. Better Auth: "Auth.js joins Better Auth" (2025-09-22): https://www.better-auth.com/blog/authjs-joins-better-auth
2. Better Auth: "Better Auth joins Vercel" (2026-07): https://better-auth.com/blog/better-auth-joins-vercel
3. Auth.js installation docs (frameworks, banner, `next-auth@beta`): https://authjs.dev/getting-started/installation
4. npm registry (`npm view next-auth time`, `npm view @auth/sveltekit peerDependencies`, `npm view @sveltejs/kit time`), checked 2026-10-09: https://www.npmjs.com/package/next-auth
5. GitHub nextauthjs/next-auth (not archived, last push 2026-07-22, ~603 open issues): https://github.com/nextauthjs/next-auth
6. Auth.js database adapters list: https://authjs.dev/getting-started/database
7. Auth.js Supabase adapter: https://authjs.dev/getting-started/adapters/supabase
8. Neon row-level security guide: https://neon.com/docs/guides/row-level-security
9. Vercel Cron usage and pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
10. Vercel Blob (private vs public storage): https://vercel.com/docs/vercel-blob
11. Supabase pricing: https://supabase.com/pricing
12. Fly.io pricing: https://docs.fly.io/about/pricing
13. Neon pricing: https://neon.com/pricing
14. Vercel pricing: https://vercel.com/pricing
15. Vercel fair use guidelines (Hobby commercial-use restriction): https://vercel.com/docs/limits/fair-use-guidelines
16. Crunchbase News on Databricks acquiring Neon: https://news.crunchbase.com/ma/databricks-billion-dollar-neon-acquisition/
