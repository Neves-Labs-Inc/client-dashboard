# Client Dashboard v1: roadmap

v1 of the client dashboard (`docs/spec-v1.md`) cut into seven ordered **Phases**, plus the mini-Phase 5a. Each Phase is planned by one `planner` run, ships to prod when done, and is followed by the next. A closing launch checklist gates the first real Client.

Sources: [Client dashboard v1: delivery Phases wayfinder map](https://github.com/Neves-Labs-Inc/client-dashboard/issues/27) and the tickets it links. This document makes no decisions of its own; a gap goes back to the spec or the map.

## Ground rules

- **Phase** is this roadmap's unit of delivery. It is not a "milestone", which `CONTEXT.md` defines as a GitHub repo milestone inside a Project. Phase is an engineering term and stays out of `CONTEXT.md`.
- **Size cap:** at most 8 tickets per Phase. Ticket estimates below are guidance; the planner sets the real tickets.
- **Strictly sequential:** one Phase at a time, in order. Each one builds on the previous, and Phases 5–7 all extend the same Overview page, nav counts and alert-icon slots.
- **Every Phase deploys to prod** when done. Prod is invite-only and no real Client is invited until all of v1 is done, so unfinished areas are unreachable.
- **No dead links:** the shells ship nav entries only for areas that exist. Each Phase adds its own nav entry, count and Admin alert icon. No "coming soon" pages.
- **Accessibility and responsive** checks from `DESIGN.md` are acceptance criteria on every UI ticket in every Phase, not a final hardening pass.
- **Toolchain:** pnpm, Vitest, ESLint (typescript-eslint) + Prettier with prettier-plugin-tailwindcss, Node 24 LTS. Code follows the `coding-style` skill.
- **Spec is final:** a gap found while planning a Phase goes back to `docs/spec-v1.md`, not into this roadmap.
- **Microsoft sign-in is deferred** (Franklin, 2026-10-13): it returns later as one small ticket once an Entra app exists, with no Phase of its own.

## Phases at a glance

| # | Phase | Spec slices | Est. tickets | Ends on prod with |
|---|---|---|---|---|
| 1 | Foundation | 1–2 | 6–7 | `portal.neveslabs.dev` serves the token-styled placeholder; deploys run migrations |
| 2 | Admin access | 3–5 (Admin path) | ~7 | Admin signs in with a passkey, creates a Client, invites a first Owner |
| 3 | Client access | 3–5 (Client User path) | ~8 | An Owner signs in and manages the roster; archive locks a Client out |
| 4 | Board sync | 7 (engine + linking) | ~7 | A linked test board syncs by webhook, cron and "Sync now" |
| 5 | Client Projects | 7 (board detail) + 8 | 5–7 | Clients see Overview KPIs, Projects and Project views |
| 5a | Admin preview | (new) | 1–2 | The Admin previews a Client's pages read-only |
| 6 | Requests | 9 | ~5 | Clients submit Requests; the Admin triages and links Tasks |
| 7 | Invoices | 6 | 5–7 | The Admin issues, pays and voids Invoices; Overdue shows |
| — | Launch checklist | 10 | 0 (manual) | Ready for the first real Client |

GitHub sync (slice 7) comes before Invoices (slice 6), and Requests before Invoices, by Franklin's call.

## Gates (every Phase)

A Phase is done when all of these hold:

1. CI is green on `main`, including the RLS cross-Client suite.
2. The migrate-gated prod deploy succeeded.
3. `docs/runbook.md` and `.env.example` cover every setting the Phase added.
4. **Local walkthrough (before merge):** `qa-visual` runs the Phase's walkthrough against the local dev server.
5. **Prod walkthrough (after deploy):** Franklin runs the same walkthrough by hand on `portal.neveslabs.dev`.

Vercel preview deploys stay off (`docs/spec-v1.md`, Stack table), so the agent check is local only. The local walkthrough signs in with Playwright's virtual WebAuthn authenticator (Admin passkey) and Mailpit in Docker Compose (magic-link and Invitation emails). There is no test-only sign-in backdoor. Google sign-in and real Gmail delivery are checked on prod only.

Prerequisites come in two buckets per Phase: **before coding** (local dev and tests) and **before prod deploy**. Each is named here with what it provides; the step-by-step setup goes in `docs/runbook.md`, and the planner picks env var names and records them in `.env.example`.

## Phase 1 · Foundation

**Scope:** spec slices 1–2. Scaffold (React Router v7, Tailwind v4), tooling (pnpm, Vitest, ESLint, Prettier), CI (typecheck, tests, Docker build), Dockerfile, local Docker Postgres, Drizzle, roles migration (`app_tenant`, `app_system`), two pools, the tenant-aware data module with `SET LOCAL` transactions, `clients` table with RLS, the cross-Client RLS test harness (plus the `BYPASSRLS` assertion), and the prod deploy pipeline: Vercel Pro + Neon `us-east-1` Postgres 18, migrate-gated deploy, `docs/runbook.md`.

**UI:** a placeholder page in the `DESIGN.md` tokens, with shadcn initialised and re-skinned. No app shell.

**User stories:** none directly; everything later stands on it.

**Depends on:** nothing.

**Before coding:** none.

**Before prod deploy:**
- Vercel Pro project (`iad1`, previews and Git auto-deploy off)
- Vercel token, org ID and project ID as GitHub Actions secrets
- Neon project (`us-east-1`, Free plan)
- DB secrets: `neondb_owner` direct URL, `app_tenant` and `app_system` passwords
- GoDaddy DNS: `portal` CNAME to Vercel. The `www` CNAME and apex A record point at the business site's own Vercel project (`neveslabs-site`), not the portal's
- Branch protection on `main` with CI required

**Prod walkthrough:** `portal.neveslabs.dev` serves the token-styled placeholder over TLS; `/healthz` returns 200; `www.neveslabs.dev` serves the business site and `neveslabs.dev` 308-redirects to it; a deploy ran the migrations.

## Phase 2 · Admin access

**Scope (~7 tickets):** Better Auth behind the auth module (UUID ids, `app_system` pool, 90-day sliding sessions); mailer module (Gmail SMTP) wired to the magic-link hook, with Mailpit for local dev; `ADMIN_EMAIL` magic link that only reaches passkey registration, passkey sign-in, Admin guard; sign-in and passkey screens; Admin shell + Home Clients table; create Client (drawer → Team tab); first-Owner Invitation (7-day expiry, revoke/resend, `ADMIN_EMAIL` never invitable, one-Client hook) with the pending list.

**User stories:** 2, 2a, 6 (sending), 8 (Admin side), 9, 10 (hook), 32 (Clients table), 33.

**Depends on:** Phase 1.

**Notes:**
- Invitations are created and emailed for real, to Franklin's own test addresses only. The link is refused until Phase 3 adds acceptance.
- The Admin shell ships nav entries only for what exists (Home, Clients).

**Before coding:** a dedicated Gmail account with 2-Step Verification and an app password (name still TBD).

**Before prod deploy:** Better Auth secret, `ADMIN_EMAIL` and Gmail credentials in Vercel; confirm `neveslabs.dev` has no MX record.

**Prod walkthrough:** the Admin signs in with a passkey, creates a Client and invites a first Owner; the email arrives; the link is refused.

## Phase 3 · Client access

**Scope (~8 tickets):** Client User sign-in (Google, magic link; Microsoft deferred); invite-only rejection with no account created; accepting an Invitation (email must match); client shell + per-request membership → `clientId`; Owners invite Members; promote/demote/remove/leave and the last-Owner rule (with its sole-user exception), with session revocation; Admin Team roster controls; Client Team (Owner controls, Member read-only); Profile; archive/unarchive Client.

**User stories:** 1, 3, 4, 5, 6 (acceptance), 7, 8 (Owner side), 10, 11, 12, 13, 14, 15, 34.

**Depends on:** Phase 2.

**Notes:**
- Archive/unarchive lives here, where there are Client Users to lock out, so it can be checked end to end.
- **Overflow valve:** if the planner's Phase 3 comes out over 8 tickets, the Profile page moves to Phase 5 first.

**Before coding:** one Google OAuth client with the localhost and prod redirect URIs (done).

**Before prod deploy:** the OAuth credentials in Vercel.

**Prod walkthrough:** an Owner accepts and signs in with Google and a magic link; invites a Member; promote, demote and remove work; archiving locks the Client out and unarchiving restores it.

## Phase 4 · Board sync

**Scope (~7 tickets):** GitHub App auth + `PmSource` adapter (GraphQL board fetch, fixtures); schema for `projects`, `status_updates`, `milestones`, `tasks`, `project_status_mappings` + RLS cross-Client suite; refetch + upsert with every mapping rule (visibility, soft-hide, empty Status = Up next, flagged unmapped options, milestone merge, field warnings, closed board) and sync state; webhook endpoint with signature check; reconcile poll + Vercel Cron (every 15 min) + advisory lock, "Sync now"; unassigned pool with link, unlink/freeze, relink revive and delete Project; column-mapping UI + save.

**User stories:** 32 (Unassigned boards panel), 35, 36, 39, 40.

**Depends on:** Phase 3.

**Notes:** the Phase is usable on prod by itself: the Admin links a board and maps its columns, and data flows. Client-facing screens come in Phase 5.

**Before coding:** dev GitHub App on `Neves-Labs-Inc`, smee.io channel, an org-owned test board with the 3 required fields.

**Before prod deploy:** prod GitHub App (private key, webhook secret, App ID, installation ID) and the Cron auth secret in Vercel.

**Prod walkthrough:** link the test board and map its columns; an edit on GitHub shows up via webhook; "Sync now" and the 15-minute cron both work.

## Phase 5 · Client Projects

**Scope (5–7 tickets):** Admin board detail (field check, Milestone progress, Tasks, sync state, "Sync now"); sync-problem flag + Admin sidebar icon; data-module read models (summaries, current Milestone, Task counts, Past Project rule); Projects list; Project view (Status Update timeline with sanitised Markdown, Milestone/Task grouping with "Other work"; may split); the Client Overview page with its KPI row (active, On track), Projects panel and Projects nav count.

**User stories:** 16 (Overview page, Projects KPIs and panel), 17, 18, 19, 20, 21, 22, 37, 38.

**Depends on:** Phase 4.

**Notes:**
- This Phase creates the Overview page and KPI row. Phases 6 and 7 only add their own panels and KPIs.
- Receives the Profile page if Phase 3 overflowed.

**Before coding / before prod deploy:** none.

**Prod walkthrough:** a Client sees the Overview KPIs, the Projects list and a Project view; the Admin sees board detail and the sync-problem icon.

## Phase 5a · Admin preview

**Scope (1–2 tickets):** the read-only "view as <Client>" preview of the client pages as the Client's Owner sees them, per `docs/spec-v1.md` "Admin preview (view as Client)".

**User stories:** 49.

**Depends on:** Phase 5.

**Notes:** entry, exit, expiry and audit were settled in Phase 5a planning (`docs/spec-v1.md` "Admin preview (view as Client)"): no preview state, so a preview lasts as long as the Admin's session, and no audit (Franklin, Phase 5a planning (2026-10-16)). Its tickets get the security review axis: the preview reads tenant data through `app_tenant` + `SET LOCAL`, never the system pool.

**Before coding / before prod deploy:** none.

**Prod walkthrough:** the Admin previews a Client's Overview and Projects and can't change anything.

**Sequencing note:** Phase 6 shipped before Phase 5a. 5a's preview therefore also covers the Requests list and detail, with submit, edit and withdraw hidden. This is a sequencing note, not a behaviour change (Franklin, Phase 6 planning (2026-10-16)).

## Phase 6 · Requests

**Scope (~5 tickets):** schema + RLS cross-Client suite, status and Task-link invariants (`task_title` snapshot, cleared on status change); Client submit/edit/withdraw drawer + server rules (submitter only, New only); Client list + detail (live Task or "(no longer tracked)"); Admin inbox + Client Requests tab + triage detail with Task picker; Overview Requests panel, Requests nav count, inbox alert icon.

**User stories:** 16 (Requests panel), 27, 28, 29, 30, 31, 45, 46, 47, 48.

**Depends on:** Phase 5 (Overview page, slots) and Phase 4 (Tasks for the link).

**Notes:** the Task link ships in this Phase; the spec's "Requests without the Task link" fallback isn't needed. About 3 tickets of headroom make this a second overflow valve after Phase 5.

**Before coding / before prod deploy:** none.

**Prod walkthrough:** a Client submits, edits and withdraws a Request; the Admin triages it and links a Task; nav counts and the inbox alert icon update.

## Phase 7 · Invoices

**Scope (5–7 tickets):** schema for `invoices`, `line_items`, `invoice_counters` + RLS suite, Overdue derived in `America/New_York`; authoring server (validation, numbering in the insert transaction, date defaults); authoring drawer UI; Paid / revert / Void with confirmations + Admin Invoices tab; Client Invoices list + detail (Void filtered); Overview Invoices panel, balance and Overdue KPIs, Invoices nav count, Admin Overdue alert icon (may fold into the list ticket). Plus a small runbook ticket, if the launch checklist needs one.

**User stories:** 16 (Invoices panel, balance and Overdue KPIs), 23, 24, 25, 26, 41, 42, 43, 44.

**Depends on:** Phase 6.

**Before coding / before prod deploy:** none.

**Prod walkthrough:** create and number Invoices; Pay, revert and Void work; Overdue and balance KPIs show; the Overdue alert icon works.

## Launch checklist (after Phase 7)

Manual work, not a Phase. It gates inviting the first real Client.

- [ ] Upgrade Neon from Free to a paid plan.
- [ ] Move personal-account boards to the `Neves-Labs-Inc` org.
- [ ] Review `docs/runbook.md` end to end.

Backups are left out, by Franklin's decision.

## Out of scope

- Writing any Phase's tickets or code: the planner and coders do that per Phase.
- Changing v1 behaviour: `docs/spec-v1.md` is final.
- Onboarding the first real Client.
