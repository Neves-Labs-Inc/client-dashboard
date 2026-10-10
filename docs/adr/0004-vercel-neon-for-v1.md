---
status: accepted
---

# Vercel + Neon for v1, portable to AWS later

Supersedes `0002-aws-ecs-over-vercel.md`. For v1 the app runs on Vercel Pro and its database on Neon Postgres, instead of ECS Express Mode with RDS. At v1 scale, AWS meant owning a VPC, Terraform, a manual load-balancer listener edit for the custom domain, and roughly three times the monthly cost. Vercel + Neon removes all of that. The goal of control and no lock-in is kept by making the later move to AWS a redeploy, not a rewrite.

Portability rules, from day one:

- Neon is plain Postgres reached only through Drizzle over a connection string. No vendor SDKs.
- The GitHub reconcile poll is an HTTP-triggered job. Vercel Cron calls it now, and on AWS a timer or EventBridge calls the same code. Its lock is a transaction-level advisory lock (`pg_try_advisory_xact_lock`), which works behind Neon's pooler.
- The database roles (`app_tenant`, `app_system`) and their grants are created in migrations, because `pg_dump` does not carry roles.
- App code uses no Vercel-only APIs, and CI builds the Dockerfile on every PR.

Neon was chosen over Supabase because Supabase's free tier pauses projects and Supabase auto-exposes the `public` schema through its Data API. Both would need working around, for no benefit to this app.

## Consequences

- No Terraform in v1. `docs/runbook.md` records the Vercel, Neon and GoDaddy settings, and Terraform returns with the AWS move.
- Deploys go through GitHub Actions (migrate, then `vercel deploy --prod`), not Vercel's Git auto-deploy, so a failed migration blocks the release.
- The RLS design in `0003` works on Neon with these constraints (see [Does the RLS role design work on Neon?](https://github.com/Neves-Labs-Inc/client-dashboard/issues/21)):
  - The Neon project runs Postgres 16 or later.
  - `app_tenant` and `app_system` are created by a SQL migration run as `neondb_owner`, never in the Console, CLI or API.
  - Tenant work and the poll run in interactive transactions over the pooled URL, using a `pg` / Neon `Pool` driver and not `neon-http`. Migrations use the direct URL.
  - Policies wrap the setting as `NULLIF(current_setting('app.client_id', true), '')`.
  - The RLS tests assert that `app_system` still has `BYPASSRLS`.
