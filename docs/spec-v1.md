# Client Dashboard v1: spec

Compiled 2026-10-10 for [Assemble the v1 spec][#20], the destination of the [Client dashboard v1: wayfinder map][#1]. This document makes no new decisions. Every behavior below comes from a closed ticket, an ADR, `CONTEXT.md` or `DESIGN.md`, and its section cites the source. Gaps the first draft exposed were settled by their own tickets and folded in; [Open gaps](#open-gaps) records where each answer came from. Status: **final**, ready for the planner.

Domain words (**Client**, **Client User**, **Owner**, **Member**, **Invitation**, **Admin**, **Project**, **Past Project**, **Status Update**, **Milestone**, **Task**, **Invoice**, **Line Item**, **Overdue**, **Void**, **Request**) are used exactly as `CONTEXT.md` defines them. `CONTEXT.md` is the glossary; this spec does not restate it.

## Problem Statement

Neves Labs' freelance Clients have no single place to see how their work is going or what they owe. Project status lives on Neves Labs' internal GitHub boards, which mix client-facing work with internal work. Invoices exist as PDFs and a spreadsheet. Bugs and feature asks arrive scattered over email and Slack. Clients ask, and Franklin answers by hand.

## Solution

A private, invite-only web portal at `portal.neveslabs.dev`. Each Client's people (Client Users) sign in and see only their Client's data:

- each **Project**'s health, Status Update timeline and client-visible **Tasks**, mirrored one way from org-owned GitHub Projects v2 boards (the dashboard never authors Project data);
- their **Invoices**, authored in the dashboard by the Admin and read-only for Client Users;
- their **Requests** (bug reports and feature asks), submitted and tracked in the dashboard.

Owners manage their Client's roster. The Admin (Franklin) manages every Client from a Client-centric Admin area: creates Clients, invites the first Owner, links GitHub boards, authors Invoices and triages Requests. Client data never crosses between Clients, enforced both in the app and by Postgres row-level security.

Sources: [Client dashboard v1: wayfinder map][#1], [What does a Client User see for a Project?][#4], [How does the Admin add Invoices and update their status?][#7], [How do Client Users submit bugs and requests?][#12].

## User Stories

### Signing in and Invitations

1. As a Client User, I want to sign in with Google, Microsoft or a magic link, so that I don't manage another password.
2. As the Admin, I want passkey sign-in (magic link only for recovery), so that the account that sees every Client is phishing-resistant.
2a. As the Admin, I want to bootstrap (and recover) my account by magic link to `ADMIN_EMAIL`, which only lets me register a passkey, so that the first passkey needs no seed script and a stolen inbox never opens the Admin area.
3. As a Client User, I want my session to last 90 days and extend on each visit, so that I rarely sign in again.
4. As a person who was never invited, I want my sign-in refused with no account created, so that the portal stays invite-only.
5. As an invitee, I want to accept my Invitation by signing in as the invited email, so that nobody else can use my link; signing in with any other email is refused.
6. As the Admin, I want to invite a Client's first Client User, who joins as an Owner, so that each Client starts with someone who manages its roster.
7. As an Owner, I want to invite teammates by email, who always join as Members, so that my colleagues get access.
8. As an Owner or the Admin, I want an Invitation to expire after 7 days and be revocable (and resendable), so that stale links stop working.
9. As the Admin, I want an expired Invitation to drop off the list rather than be flagged, so that I just send a new one when needed.
10. As an Owner, I want an invite refused when the email already belongs to a Client User of another Client, so that every Client User belongs to exactly one Client.

### Roster (Owners and Admin)

11. As an Owner, I want to promote, demote and remove any Client User, other Owners included, so that I control who sees our data.
12. As an Owner, I want the system to stop the last Owner from leaving or being demoted until another Owner exists, so that my Client always has an Owner.
13. As the Admin, I want to promote, demote and remove any Client's users, so that I can fix rosters; the last-Owner rule binds me too.
14. As a removed Client User, I lose access at once (sessions end), while my past actions stay attributed to me.
15. As a Member, I want to see everything an Owner sees, Invoices included, so that nothing is hidden from me by role.

### Client User: overview and Projects

16. As a Client User, I want to land on an overview with summary numbers (active Projects, On track count, open balance, Overdue count), my Projects, and my latest Invoices and Requests, so that I see where things stand at a glance.
17. As a Client User, I want each Project's health from its latest Status Update (health, dates, Markdown note), with earlier Status Updates as a timeline, so that I understand how it's going and how it got there.
18. As a Client User, I want a Project's client-visible Tasks grouped by Milestone, then by Up next / In progress / Done, with Tasks without a Milestone in a trailing "Other work" group, so that I see what's coming and what's finished.
19. As a Client User, I want each Milestone to show its name, target date and progress (Done over client-visible Tasks), so that I can gauge each stage.
20. As a Client User, I want each Task to show its title, client status, optional target date, client note and completed date, so that I know the state of each piece of work.
21. As a Client User, I want finished, inactive, closed or unlinked Projects in a Past Projects section that stays readable, so that history isn't lost.
22. As a Client User, I never see internal work, internal board columns, issue bodies, sync times or sync errors.

### Client User: Invoices

23. As a Client User, I want a list of my Client's Invoices (number, issued, due, amount, status), newest first, so that I know what we owe and what we've paid.
24. As a Client User, I want an Invoice detail with its Line Items, memo and Project, so that I can see what I'm billed for.
25. As a Client User, I want Overdue Invoices flagged automatically, so that I notice late payments.
26. As a Client User, I never see Void Invoices.

### Client User: Requests

27. As a Client User (Owner or Member), I want to submit a Request (Bug or Feature, title, description, optional Project) from a drawer, so that I can report problems or ask for features without email.
28. As a Client User, I want to see all of my Client's Requests, so that we don't file duplicates.
29. As the submitter of a New Request, I want to edit or withdraw it, so that I can fix mistakes; after it leaves New it is locked.
30. As a Client User, I want to see a Request's status and the Admin's response note, so that I know what happened to it.
31. As a Client User, I want an Accepted or Done Request to point to the Task it became, so that I can follow its progress; if that Task is later hidden or removed, the Request shows its last title as "no longer tracked".

### Admin: Clients and boards

32. As the Admin, I want a Home with a table of Clients and an Unassigned GitHub boards panel, so that I can see all Clients and link new boards.
33. As the Admin, I want to create a Client by name and land on its Team tab with the "Invite first Owner" form open, so that onboarding is one flow.
34. As the Admin, I want to archive a Client (its Client Users lose access, nothing is deleted) and unarchive it (their access returns), so that ended engagements are kept without being visible.
35. As the Admin, I want to link a GitHub board to a Client by hand and map each of its `Status` options to Up next / In progress / Done, so that the Client is never inferred and internal columns stay hidden.
36. As the Admin, I want to save a mapping with unmapped columns, with their Tasks counted as In progress and the board flagged, so that a new column never blocks the sync.
37. As the Admin, I want a board detail page that checks the required GitHub fields exist, shows Milestone progress, lists Tasks with their client status, and shows sync state with a "Sync now" button, so that I can verify what the Client sees.
38. As the Admin, I want a linked board flagged as a sync problem when its last sync errored or it hasn't synced in over an hour, so that I notice stale data.
39. As the Admin, I want to unlink a board, freezing its Project as a Past Project and returning the board to the unassigned pool, so that I can end or move an engagement; re-linking to the same Client revives the frozen Project, and linking to a different Client starts a new Project there.
40. As the Admin, I want to delete a Project explicitly, so that I can fix a wrong assignment (delete and re-link).

### Admin: Invoices

41. As the Admin, I want to author an Invoice for a Client in a drawer form (issue date defaulting to today, due date to 30 days later, optional memo, optional Project, one or more Line Items), with the amount computed from the Line Items and the number assigned automatically, so that billing lives in the dashboard.
42. As the Admin, I want to enter past invoices by hand through the same form, so that history is complete without an import feature.
43. As the Admin, I want to mark an Open Invoice Paid (with confirmation and the paid date), so that the Client sees it settled, and to revert a Paid Invoice back to Open (with confirmation) so that a mistaken Paid can be undone.
44. As the Admin, I want to void an Open or Overdue Invoice (with confirmation), final and keeping its number, so that mistakes are cancelled; I fix a mistake by voiding and issuing a new Invoice, never by editing.

### Admin: Requests

45. As the Admin, I want a Requests inbox across every Client with a New count in the sidebar, plus each Client's Requests tab, so that I triage without email.
46. As the Admin, I want to set a Request's status (New, Accepted, Declined, Done) and one response note the Client sees (overwritable), so that Clients know the outcome.
47. As the Admin, I want to link an Accepted or Done Request to one Task from the Client's mirrored Projects, with any other status clearing the link, so that the Client follows progress on the real work.
48. As the Admin, I see Withdrawn Requests read-only.

## Implementation Decisions

### Users, roles and access

- **Admin**: Neves Labs staff (today Franklin). Not a Client User, belongs to no Client, sees and manages every Client. Signs in with a passkey; magic link is recovery only. ([Auth.js or Better Auth?][#11])
- **Client User**: belongs to exactly one Client, with role **Owner** or **Member**. Owners and Members see the same data, Invoices included; only Owners manage the roster. ([Who within a Client can invite and remove Client Users?][#5])
- Nothing is role-restricted for reading within a Client. ([#5][#5])
- **Admin designation:** the Admin is whoever signs in as the `ADMIN_EMAIL` env var; there is no admin role in the DB. That email can never be invited as a Client User. ([Settle the auth and access gaps][#23])
- A Client always has at least one Owner. The last Owner can't leave, be demoted or be removed until another Owner exists, and this binds the Admin too (no override). The only exception: removing a sole Owner who is the Client's only Client User, which leaves the Client with no users until the Admin invites a new first Owner. ([#5][#5], [#23][#23])

### Authentication and Invitations

Sources: [Auth.js or Better Auth?][#11], `docs/adr/0001-better-auth-over-authjs.md`, [Who within a Client can invite and remove Client Users?][#5], [What does the Admin area look like?][#19], `CONTEXT.md` (Invitation).

- **Library: Better Auth** (self-hosted), with its organization plugin for the roster (roles) and Invitations. One Better Auth organization per Client.
- **One auth module** of ours wraps every roster and auth call, so a future swap is contained. Nothing else calls Better Auth directly.
- **Client User sign-in methods:** Google, Microsoft (work/school and personal accounts: Entra audience `common`), magic link. ([#23][#23])
- **Admin sign-in:** passkey required. `ADMIN_EMAIL` is exempt from invite-only and may sign in by magic link, but that session can only reach "register a passkey"; the Admin area opens only after a passkey sign-in. This one path covers both the first-passkey bootstrap and recovery from a lost passkey. ([#11][#11], [#23][#23])
- **Sessions:** 90 days, sliding (extended on each visit).
- **Invite-only:** an uninvited sign-in is rejected and no account is created. Nobody becomes a Client User without an Invitation.
- **Email must match:** accepting an Invitation means signing in as the invited email; any other email is refused.
- **Who invites:** the Admin invites only a Client's **first Owner**. After that, Owners invite, and an Owner's Invitation always makes a Member. The Admin can still promote, demote and remove any Client User. (#19 narrows #5's "Admin can invite"; see conflicts.)
- **Invitation lifetime:** 7 days; can be revoked; can be resent. An expired Invitation is gone: it drops off lists and a new one must be sent. Nothing is shown as "expiring".
- **One Client per Client User:** an Invitation is rejected if the email already belongs to a Client User of another Client, archived Clients included. A Better Auth hook enforces it. The Admin handles exceptions (e.g. removes the user from the archived Client first). ([#23][#23])
- **Removal or leaving:** deletes the Client User's `member` row and revokes their sessions immediately. The Better Auth `user` row is never deleted, so attribution survives; "removed" is the absence of a membership. ([What is the v1 data model?][#16])
- **Active Client:** for a Client User, the Client comes from a membership lookup on each request. Better Auth's `activeOrganizationId` is not used. ([App-level tenant scoping alone, or plus Postgres RLS?][#13])
- **Archived Client:** archiving revokes every session of its Client Users at once, and a later sign-in is refused with a plain "This account no longer has access" message (no app shell). Unarchiving lets them sign in again. ([#16][#16], [#19][#19], [#23][#23])
- Email for magic links and Invitations goes through the mailer module (see [Email](#email)).

### Tenant isolation

Sources: [App-level tenant scoping alone, or plus Postgres RLS?][#13], `docs/adr/0003-app-scoping-plus-rls-backstop.md`, [Does the RLS role design work on Neon?][#21], `docs/adr/0004-vercel-neon-for-v1.md`, [Settle the ops and infra gaps][#22].

- **App scoping:** every query on Client-owned data goes through one tenant-aware data module that takes `clientId` explicitly. Admin routes also go through it, with an explicit `clientId`.
- **RLS backstop:** every Client-owned table has `ENABLE` + `FORCE ROW LEVEL SECURITY`. Policies are a plain equality check written as `client_id = NULLIF(current_setting('app.client_id', true), '')::uuid`, so an unset or empty setting returns no rows and allows no writes.
- **Roles:**
  - **`neondb_owner`** is the migrator: CI runs migrations as it, so it owns the tables (`FORCE` RLS applies to it too). There is no separate migrator role;
  - **`app_tenant`** runs all Client User traffic, is subject to RLS, and is never a `neon_superuser` member. Each tenant request runs in one transaction that sets `app.client_id` locally (`SET LOCAL` / `set_config(..., true)`);
  - **`app_system`** has `BYPASSRLS` and runs the Admin's routes (always, including inside a single Client's pages), the GitHub sync and Better Auth.
  - Choosing a connection pool is choosing whether to bypass. There is no bypass flag.
- **`client_id` on every Client-owned row**, Line Items and Tasks included, with a composite foreign key to the parent (`(parent_id, client_id)`) so it can't drift.
- **Better Auth tables** have no RLS and are reached only through `app_system`.
- **Neon constraints:**
  - Postgres 16 or later (new projects default to 18).
  - `app_tenant` and `app_system` are created by a SQL migration run as `neondb_owner`, never in the Neon Console, CLI or API. Roles and grants live in migrations because `pg_dump` doesn't carry roles.
  - **Role passwords** are never in migration files. The migration creates the roles without a password; a step that runs right after every migrate sets them with `ALTER ROLE … PASSWORD` from secrets (GitHub Actions secrets in the deploy job; `.env` for local and test databases). Rotating a password means updating both the GitHub Actions secret and the Vercel env var that holds the matching `DATABASE_URL`.
  - Tenant work and the reconcile poll run in **interactive transactions over the pooled URL**, using node-postgres or the `drizzle-orm/neon-serverless` Pool, **not** `neon-http`. Migrations use the **direct** URL.
  - Fallback if `BYPASSRLS` is ever refused: a permissive `TO app_system USING (true) WITH CHECK (true)` policy per table.

### Data model

Sources: [What is the v1 data model?][#16], amended by [What does the Admin area look like?][#19]; [Lock the PM tool and how status syncs][#9]; [How does the Admin add Invoices and update their status?][#7]; [How do Client Users submit bugs and requests?][#12]; ADR 0003.

**Conventions**

- **Keys:** UUIDv7 everywhere; Better Auth is configured to generate UUIDs too.
- **Enums:** Postgres enums (`pgEnum`) for client status, Invoice status, Request kind, Request status and role. From the domain: client status `Up next / In progress / Done`; Invoice status `Open / Paid / Void`; Request kind `Bug / Feature`; Request status `New / Accepted / Declined / Done / Withdrawn`; role `Owner / Member`. Health from GitHub: `On track / At risk / Off track / Complete / Inactive` (`ON_TRACK / AT_RISK / OFF_TRACK / COMPLETE / INACTIVE`).
- **Money:** `amount_cents bigint` on Line Items, USD only. An Invoice's amount is computed from its Line Items and never stored.
- **History:** current status plus `status_changed_at` (and `paid_at` on Invoices). No status-event tables, no sync-run history.
- **Attribution:** columns recording who did something (e.g. a Request's submitter) reference Better Auth's `user.id`.
- **Deletes:** Clients are archive-only (no hard delete in v1). Tasks are soft-hidden. Projects can be deleted by the Admin.

**Tables**

| Table | Key columns and rules | RLS |
|---|---|---|
| Better Auth core + org plugin (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, passkey) | Shaped by Better Auth; roster and Invitations live here | None; `app_system` only |
| `clients` | `id` = `organization.id` (FK); domain fields; `archived_at` | Yes (on `id`) |
| `projects` | `client_id`; `github_project_node_id`; name = board title; `unlinked_at`; `last_synced_at`, `last_sync_error`, `sync_warnings jsonb` (replaced each sync, Admin-only) | Yes |
| `status_updates` | `client_id`, `project_id`; health, start/target dates, Markdown body (mirrored) | Yes |
| `milestones` | `client_id`, `project_id`, title, due date; unique `(project_id, title)` | Yes |
| `tasks` | `client_id`, `project_id`, optional milestone; keyed by the GitHub project-item node id; title, client note, target date, completed date, Status option; `hidden_at` | Yes |
| `project_status_mappings` | `project_id`, `github_option_id`, `option_name`, `client_status` (unmapped options added by the sync as flagged rows, counted as In progress); carries `client_id` per the Client-owned rule | Yes |
| `invoices` | `client_id`, optional `project_id`, number, issue date, due date, memo, status, `paid_at`, `status_changed_at` | Yes |
| `line_items` | `client_id`, `invoice_id`, description, `amount_cents bigint`; at least one per Invoice | Yes |
| `invoice_counters` | `year` PK, `last_seq`; global across Clients | None; Admin-only |
| `requests` | `client_id`, optional `project_id`, submitter `user.id`, kind, title, description, status, one response note, optional `task_id` (`ON DELETE SET NULL`), `task_title` snapshot, `status_changed_at` | Yes |

**Invariants**

- A Project never moves between Clients. A wrong assignment is fixed by deleting the Project and re-linking the board.
- `github_project_node_id` is unique **only among linked Projects** (partial unique index `WHERE unlinked_at IS NULL`), not globally ([#19][#19] amends [#16][#16]). Re-linking a board to the same Client revives that Client's frozen row, which implies at most one Project row per (Client, board).
- Unlinking sets `unlinked_at`; the sync skips frozen Projects.
- Deleting a Project cascades to its Tasks, Milestones, Status Updates; Invoices and Requests detach via `ON DELETE SET NULL (project_id)` (PG15+ column-list form, so `client_id` stays).
- A Task whose item goes Internal or leaves the board is soft-hidden (`hidden_at`), not deleted. Client queries filter hidden rows.
- A Request's `task_id` is set only while it is Accepted or Done; any other status clears it (and its `task_title`).
- Linking a Task stores its title in `task_title`. When the Task is deleted (Project delete cascade), `task_id` goes null and `task_title` stays; when it is soft-hidden, the link is kept. Either way the Request shows "<task_title> (no longer tracked)" with no live status; a hidden Task that turns Visible again shows live again ([Settle the GitHub sync and Project gaps][#25]).
- An Invoice's or Request's `project_id` uses the composite `(project_id, client_id)` FK, which is why the `SET NULL` names only `project_id`.
- **Invoice numbers:** `NL-<4-digit seq>-<year>` (e.g. `NL-0001-2026`). The year is the issue date's year; the sequence resets yearly. `invoice_counters` is bumped with `UPDATE ... RETURNING` in the same transaction as the Invoice insert. A number never changes; Void leaves a gap.

### GitHub Projects v2 sync

Sources: [Which PM tool should feed client-facing project status?][#2], [Lock the PM tool and how status syncs][#9], [What is the v1 data model?][#16], [What does the Admin area look like?][#19], [How do environments, CI and deploy work?][#17], ADR 0004, [research/pm-tool.md](https://github.com/Neves-Labs-Inc/client-dashboard/blob/research/pm-tool/research/pm-tool.md).

- **Source:** GitHub Projects v2 boards owned by the `Neves-Labs-Inc` org. One board = one dashboard Project.
- **Access:** a GitHub App installed on the org, **read-only**: Organization Projects: read, Issues: read. It never writes to GitHub (Requests don't change this).
- **Adapter:** the sync sits behind a `PmSource` adapter, so Linear (the runner-up) would be a second adapter.
- **Pages never call GitHub.** The sync writes a copy into Postgres (as `app_system`); all pages read that copy.
- **Triggers:**
  - a `projects_v2*` webhook (`projects_v2`, `projects_v2_item`, `projects_v2_status_update`; org-owned projects only, public preview), signature verified, triggers a refetch of that board over GraphQL, upserted into Postgres;
  - a **reconcile poll** covers missed deliveries. It is an HTTP-triggered job called by **Vercel Cron** (on AWS later, a timer or EventBridge calls the same code), guarded by `pg_try_advisory_xact_lock` inside an interactive transaction. It runs **every 15 minutes**, which lets Neon scale to zero between runs and stay within the Free plan's compute ([Settle the ops and infra gaps][#22]);
  - the Admin's **"Sync now"** button on a board.
- **Required board fields** (fixed names): `Client visibility` (single-select `Visible / Internal`), `Client note` (text), `Target date` (date). The sync flags a board missing any of them (`sync_warnings`).
- **Mapping:**

| Dashboard | GitHub source |
|---|---|
| Project name | Board title |
| Status Update (health, dates, note) | `ProjectV2StatusUpdate`: status, start date, target date, Markdown body |
| Task | A board item that is a real issue (never a draft) with `Client visibility = Visible`. Untagged or Internal items stay hidden |
| Task title | Issue title |
| Task client status | The item's `Status` option, mapped by the Admin to Up next / In progress / Done |
| Task client note | `Client note` field, never the issue body |
| Task target date | `Target date` field |
| Task completed date | The issue's closed date |
| Milestone | Repo milestone (title + due date). On a multi-repo board, milestones with the same title merge into one; when their due dates disagree, the earliest wins and the mismatch is flagged |

- **Unmapped `Status` options:** a new option counts as In progress and is flagged to the Admin; the sync adds it as a flagged mapping row.
- **Empty `Status`:** a Visible Task with no `Status` value counts as **Up next**, with no flag ([#25][#25]).
- **Closed board:** a board closed in GitHub but still linked makes its Project a Past Project; the sync keeps mirroring it, and reopening the board makes it active again ([#25][#25]).
- **Linking:** the Admin links a board to a Client by hand, from the Unassigned GitHub boards panel on Admin Home. The Client is never inferred from GitHub data.
- **Unlinking / board deleted:** the Project freezes at its last snapshot as a read-only Past Project. An unlinked board goes back to the unassigned pool; re-linking to the same Client revives the frozen Project; linking to another Client creates a new Project there, and the old Client keeps its frozen copy. The Admin can delete a Project explicitly.
- **Freshness:** only the Admin sees last-sync time, sync errors and warnings. Client Users don't.
- **Sync problem:** GitHub's failed deliveries are invisible to the receiver, so the signal is ours: a linked board is a sync problem when `last_sync_error` is set **or** `last_synced_at` is older than 1 hour (four missed polls). `sync_warnings` don't count. Frozen (unlinked) Projects are never sync problems ([#25][#25]).
- **Setup step:** client boards on Franklin's personal account (e.g. Vertilux Shade Calculator) must move to `Neves-Labs-Inc`, because board webhooks fire only for org-owned projects.

### Client User screens

Sources: [What does a Client User see for a Project?][#4], [What is the visual direction (DESIGN.md)?][#18], `DESIGN.md` §6, §7, §9.

Navigation (sidebar on desktop, top bar + tab row on mobile): **Overview, Projects, Invoices, Requests, Team**, with counts (active Projects, Open incl. Overdue Invoices, New Requests; hidden when 0) and a user menu (name, role, Client, Profile, theme toggle, Sign out).

- **Overview (home):** KPI row (Active projects, On track `n/m`, Open balance = sum of Open + Overdue, Overdue count), Projects panel, then Invoices and Requests panels (at most 5 each, "View all").
- **Projects list:** one row per Project: health badge, name, latest Status Update note, current Milestone with progress bar, Task counts (Up next / In progress / Done). Past Projects sort below active ones.
- **Project view:**
  - top: latest Status Update (health, dates, Markdown note); earlier Status Updates as a timeline below. No separate activity feed;
  - Tasks grouped by Milestone (header: name, target date, progress = Done / client-visible Tasks), then by Up next / In progress / Done; Tasks with no Milestone in a trailing "Other work" group;
  - each Task: title, client status, optional target date, client note, completed date.
- **Past Projects:** a Project whose latest health is Complete or Inactive, whose board is closed in GitHub, or that is no longer mirrored, is a Past Project; it stays readable, frozen as it last was if unmirrored.
- **Invoices:** table (Number, Issued, Due, Amount, Status), newest issue date first; Status is Open, Paid or Overdue. Void Invoices are filtered out in the loader, never rendered. Row opens the Invoice detail (Line Items, memo, Project).
- **Requests:** table (Kind, Title, Status, Submitter) of all the Client's Requests; "New request" opens the request drawer (Kind, Title, Description, optional Project). Request detail shows status, response note, linked Task (or last title "(no longer tracked)"); the submitter can edit (same drawer) or withdraw while New.
- **Team:** roster and Invitation management for Owners. Members see a read-only roster (names, emails, roles) with no controls and no pending Invitations. ([#23][#23])
- **Profile** (user menu): display name editable; email, role, Client and linked sign-in methods (Google / Microsoft) read-only; a "Leave Client" action, subject to the last-Owner rule. ([#23][#23])
- Client Users never see: internal Tasks, internal board columns, issue bodies, sync state.
- Client Users only read Projects and Invoices; the only things they write are Requests (and, for Owners, the roster).

### Admin area

Sources: [What does the Admin area look like?][#19], `DESIGN.md` §6.3, prototype `prototype/admin-area` (`prototypes/admin-area/index.html?variant=A`, throwaway).

- **Structure: Client-centric (variant A)**, reusing the client shell and tokens. No forked tokens.
- **Sidebar:** Home; Requests inbox (all Clients, New count); the list of active Clients, each row showing one **alert icon per active reason** (right-aligned, lucide, tooltip + `aria-label`): New Requests (`inbox`, with the New count), sync problem (`refresh-cw-off`), Overdue Invoice (`receipt`); no icons when nothing needs attention ([#25][#25]); "+ New client"; a collapsed Archived group.
- **Home:** a table of Clients plus an **Unassigned GitHub boards** panel, where boards are linked.
- **Client workspace tabs:** Overview, Projects & boards, Team, Invoices, Requests. Clicking a row replaces the tab's list with a detail view with a back link. Create and edit forms open in the right-hand drawer.
- **Create Client:** drawer asks for a name; then the Team tab opens with "Invite first Owner".
- **Team:** first-Owner Invitation; promote, demote, remove users; pending Invitations (revoke/resend). Expired Invitations drop off.
- **Archive / unarchive** a Client. An archived Client's data is kept, read-only for the Admin ([#16][#16]).
- **Projects & boards:** link and unlink boards, column → client-status mapping (saving with unmapped columns allowed; those Tasks count as In progress and the board is flagged). Board detail: required-field check, Milestone progress, Tasks with client status, sync state, "Sync now". Boards that are sync problems (error, or stale over 1 hour) are flagged. Delete Project.
- **Invoices:** author (see [Invoices](#invoices)); mark Paid, revert Paid to Open, and Void, each with a confirmation.
- **Requests:** triage from the global inbox or the Client's tab; the detail view sets the status and the one response note and links a Task (only while Accepted or Done). Withdrawn Requests are read-only.
- The Admin always runs as `app_system` (ADR 0003).

### Invoices

Sources: [How does the Admin add Invoices and update their status?][#7], [What does the Admin area look like?][#19], `CONTEXT.md`.

- **Authored in the dashboard** by the Admin via a form; there are no source PDFs. Past invoices are typed in by hand the same way (no import, no backfill script).
- **Fields:** number (auto), issue date, due date, status, paid date, optional memo, optional Project (zero or one, from that Client), and one or more Line Items (description + amount). Amount = sum of Line Items, computed, never typed. USD only.
- **Amounts:** a Line Item amount is non-zero and may be negative (a discount or credit); the Invoice total must be greater than 0. Validated in the form and on the server. ([Settle the Invoice gaps][#24])
- **Form defaults:** issued today, due in 30 days.
- **Number:** assigned on creation (see data model). Hand-entered past invoices get new numbers too.
- **Lifecycle:** Open → Paid, Paid → Open (revert), Open → Void. Only Open (or Overdue) Invoices can be voided, never Paid ones. Void is final and keeps its number. Paid and Void each ask for confirmation; marking Paid records the paid date. Reverting Paid (with confirmation) clears `paid_at` and updates `status_changed_at`; it changes status only, so it is not an edit. A reverted Invoice is Open again (so it can be Overdue or voided). A wrong paid date is fixed by reverting and marking Paid again. ([Settle the Invoice gaps][#24])
- **Overdue** is derived: Open and past its due date. Never stored, never set by hand.
- **Business timezone:** all Invoice dates are plain dates evaluated in one configured business timezone, `America/New_York`. "Today" (the default issue date), the default due date (issue + 30 days) and Overdue use it, for every viewer and on the server. An Invoice is Overdue from the day after its due date (`today > due_date`). ([Settle the Invoice gaps][#24])
- **No edits after issue:** an issued Invoice is never edited; a mistake is fixed by voiding and issuing a new one ([#19][#19] supersedes #7's "any field can change while Open"). Moving the issue date into another year likewise means void and reissue.
- **Client view:** read-only; Void Invoices are never shown. Payment happens outside the dashboard. No PDF in v1 (neither upload nor generated).

### Requests

Sources: [How do Client Users submit bugs and requests?][#12], [What does the Admin area look like?][#19], [What is the v1 data model?][#16], `CONTEXT.md`.

- A Request lives **only in the dashboard**; it never becomes GitHub work by itself. Copying work into GitHub stays manual. The GitHub App stays read-only.
- **Submitted by** any Client User (Owner or Member). **Fields:** kind (Bug / Feature), title, description, optional Project from the Client's Projects. No attachments.
- **Visibility:** every Client User of the Client sees all its Requests.
- **Statuses:** New → Accepted / Declined → Done, set by the Admin. Withdrawn is set by the submitter; the Request is kept, not deleted.
- **Editing:** the submitter can edit or withdraw while New; after that it is locked.
- **Response note:** one note the Client sees, overwritable by the Admin. One-way, not a thread.
- **Task link:** allowed only while Accepted or Done, to one Task from the Client's mirrored Projects; any other status clears it. If the Task is later hidden or removed, the Request shows its last `task_title` as "no longer tracked".
- **Admin awareness:** inbox with a New count. No email.

### Email

Sources: [How do we set up SES on the Neves Labs domain?][#15] (supersedes [Which transactional email sender for magic links and Invitations?][#14]), [How do environments, CI and deploy work?][#17], [Auth.js or Better Auth?][#11].

- **Only** magic links and Invitations are emailed. No notifications.
- **One mailer module** is the seam: Better Auth's magic-link and Invitation hooks call it; nothing else knows the provider.
- **Provider:** Gmail SMTP (`smtp.gmail.com`) from a new, dedicated Gmail account (name TBD, e.g. `neveslabs.notify@gmail.com`), not Franklin's own, authenticated with an **app password** (needs 2-Step Verification). The sender is a `@gmail.com` address, not branded. Gmail's ~500 recipients/day cap is far above the expected volume.
- **Secret:** the app password is a Vercel sensitive env var (#15 said "AWS, injected into the ECS task"; #17 moved all secrets to Vercel).
- Rejected: Gmail API with OAuth (refresh tokens expire every 7 days while in Testing); SES (kept in Franklin's `~/learn/aws-ses/` in case it returns).
- `neveslabs.dev` receives no mail (Zoho MX removed); the root `_dmarc` record is left as is.

### Stack, hosting, environments, CI and deploy

Sources: [How do environments, CI and deploy work?][#17], `docs/adr/0004-vercel-neon-for-v1.md` (supersedes `0002` and [Lock the stack, DB and hosting][#10] for hosting), [Lock the stack, DB and hosting][#10] (framework and ORM), [What is the visual direction (DESIGN.md)?][#18] (UI stack).

| Area | Decision |
|---|---|
| Language / framework | TypeScript, React Router v7 (framework mode, SSR) |
| ORM / DB access | Drizzle; plain Postgres over a connection string, no vendor SDKs; `pg` or `neon-serverless` Pool (not `neon-http`) |
| UI | Tailwind CSS v4 + shadcn/ui (Radix, always re-skinned) + lucide-react |
| Hosting | Vercel Pro (Hobby can't be used commercially), functions in `iad1` |
| Database | Neon Postgres (16+), `us-east-1`; Free while building, upgraded to paid before the first real Client's data lands |
| File storage | None (v1 stores no files) |
| Portability rules | No Vercel-only APIs; poll is HTTP-triggered (Vercel Cron, every 15 min); transaction-level advisory lock; roles and grants in migrations; Dockerfile built in CI on every PR |
| Environments | Local (Docker Postgres) + prod only. Vercel preview deploys disabled |
| Local GitHub sync | A separate read-only **dev GitHub App** on `Neves-Labs-Inc` (own private key and webhook secret, never the prod App's) reads the real boards; its webhook URL is a smee.io channel forwarded to localhost ([#22][#22]) |
| CI (GitHub Actions, every PR, required before merge) | Typecheck; tests including the cross-Client RLS integration tests against a Postgres service container (same major version as Neon); Docker build |
| Deploy | Merge to `main` → CI → `drizzle-kit migrate` as `neondb_owner` against prod Neon (direct URL) → set `app_tenant`/`app_system` passwords from GitHub Actions secrets → `vercel deploy --prod`. A failed migration blocks the deploy. Vercel Git auto-deploy off |
| Infra as code | None in v1. `docs/runbook.md` records the Vercel, Neon and GoDaddy settings. Terraform returns with the AWS move |
| Domain + TLS | The portal is `portal.neveslabs.dev` (CNAME at GoDaddy). `www.neveslabs.dev` and the apex `neveslabs.dev` belong to the separate business website (repo `neveslabs-site`, its own Vercel project; out of scope for v1, a "Coming soon" placeholder for now). `www` is its primary domain; the apex 308-redirects to `www` (apex A record to Vercel, `www` CNAME). Vercel issues TLS |
| Secrets | Vercel sensitive env vars: Gmail app password, GitHub App private key, webhook secret, App ID and installation ID, Better Auth secret, Google OAuth client, Microsoft Entra app, Cron auth secret, `DATABASE_URL`(s). GitHub Actions secrets: prod `neondb_owner` direct `DATABASE_URL`, `app_tenant` and `app_system` passwords, Vercel deploy token, org ID and project ID |
| Observability | Vercel's built-in logs only, plus the Admin's sync-problem flag. No error tracker or alerting in v1; a failed email shows only in the logs ([#22][#22]) |
| Coding style | Franklin's `coding-style` skill (TypeScript/React) |

### Design system

Sources: [What is the visual direction (DESIGN.md)?][#18], `DESIGN.md`.

`DESIGN.md` at the repo root is law for every UI ticket: "Ops console" layout (220px sidebar, IBM Plex Sans/Mono, 14px base, 12px floor, 3px radius, tables first, request form in a drawer), "Graphite + green" palette with a teal accent, Milestone bars in the Project's health color, light and dark following the system with a System/Light/Dark toggle, four states per async surface, WCAG 2.2 AA, mobile-first at 375px. Where `DESIGN.md` differs from the prototype, `DESIGN.md` wins (its §13). This spec does not restate it.

## Testing Decisions

Sources: [App-level tenant scoping alone, or plus Postgres RLS?][#13], ADR 0003, [Does the RLS role design work on Neon?][#21], [How do environments, CI and deploy work?][#17].

- **Cross-Client RLS integration tests** against real Postgres (a service container in CI, same major version as Neon): as `app_tenant` with Client A set, no read returns Client B's rows and no write into Client B is allowed, on every Client-owned table.
- The RLS suite **asserts `app_system` still has `rolbypassrls`**.
- The catalog guard and fail-closed tests were offered in #13 and **not chosen**; they are not required.
- These run in CI on every PR and gate merge, alongside the typecheck and the Docker build.
- **Seams** (from the module decisions above; tests observe behavior through them, not internals): the tenant-aware data module (scoping and RLS), the auth module (roster and Invitation rules), the `PmSource` adapter and sync (GitHub payloads in, Postgres rows out), the mailer module (Better Auth hooks call it), and the reconcile-poll HTTP endpoint. No ticket has confirmed further seams; the planner should confirm them per ticket.
- No other test requirements were decided.

## Out of Scope

From [Client dashboard v1: wayfinder map][#1] and the tickets cited:

- File sharing / deliverables (ruled out at charting).
- Email notifications of any kind (charting); including Request notifications to the Admin ([#12][#12]).
- Invoice PDFs, uploaded or generated ([#7][#7]); Invoices are web-only.
- Invoice import or backfill script ([#7][#7]).
- Online payment; payment happens outside the dashboard ([#7][#7]).
- Currencies other than USD ([#7][#7]).
- In-app messaging / comments between Client Users and the Admin ([Are messaging and per-client branding in v1?][#8]); the Request response note is one-way.
- Per-client branding: logo, colors, custom domain ([#8][#8]).
- Request attachments ([#12][#12]).
- Writing to GitHub (creating issues from Requests, any write permission) ([#12][#12]).
- Hard-deleting Clients ([#16][#16]).
- Sync-run history and status-event history tables ([#16][#16]).
- Staging environment and Vercel preview deploys ([#17][#17]).
- Terraform / AWS hosting in v1 ([#17][#17]); kept possible by ADR 0004's portability rules.
- Linear or any second PM adapter ([#9][#9]).

## Further Notes

### Superseded decisions and how they were reconciled

- Hosting: [Lock the stack, DB and hosting][#10] (AWS ECS Express + RDS + Terraform, in-app poll timer) is superseded by [How do environments, CI and deploy work?][#17] and ADR 0004 (Vercel Pro + Neon, Vercel Cron poll). React Router v7 + Drizzle from #10 still stand.
- Framework: [Which stack, DB and hosting fit Auth.js for a multi-tenant portal?][#3] recommended Next.js only because of Auth.js; with Better Auth, #10 locked React Router v7, which ADR 0004 and `DESIGN.md` keep.
- Email: [#14][#14] (SES, IAM role, no secret) is superseded by [#15][#15] (Gmail SMTP, app password). #15's "stored in AWS, injected into the ECS task" becomes a Vercel sensitive env var under #17.
- Board node id: [#16][#16]'s global uniqueness is relaxed by [#19][#19] to linked Projects only.
- Invoice edits: [#7][#7] allowed editing any field while Open; [#19][#19] and `CONTEXT.md` say an issued Invoice is never edited (void and reissue).
- Who invites: [#5][#5] gave the Admin full invite rights; [#19][#19] and `CONTEXT.md` limit the Admin to the first Owner.
- Removal: [#5][#5]'s "soft-deleted user" is implemented by [#16][#16] as deleting the `member` row (user row kept).
- RLS policy form: ADR 0003 / #13's `current_setting(...)` equality gains `NULLIF(..., '')::uuid` from [#21][#21].
- Health labels: the PM research mapped COMPLETE/INACTIVE to "Done"/"Paused"; `CONTEXT.md` and `DESIGN.md` use Complete/Inactive.
- Milestones: the PM research preferred a project field; [#9][#9] locked repo milestones.

### Suggested slicing (guidance for the planner, not tickets)

Vertical slices in dependency order; each ends in something observable.

1. **Skeleton and pipeline:** React Router v7 app, Tailwind v4 + shadcn tokens from `DESIGN.md`, Dockerfile, GitHub Actions (typecheck, tests, Docker build), local Docker Postgres, deploy job (migrate then `vercel deploy --prod`), domain and runbook.
2. **Database foundation and isolation:** Drizzle setup, roles migration (`app_tenant`, `app_system`), two pools, the tenant-aware data module with `SET LOCAL` transactions, `clients` table with RLS, and the cross-Client RLS test harness (plus the `BYPASSRLS` assertion). Every later table adds itself to this suite.
3. **Auth:** Better Auth behind the auth module, mailer module (Gmail SMTP), Admin passkey sign-in, Client User Google/Microsoft/magic link, invite-only enforcement.
4. **Clients and rosters:** Admin creates/archives/unarchives Clients and invites the first Owner; Owners invite Members, promote/demote/remove, last-Owner rule, one-Client rule; Admin and Client Team screens.
5. **App shell:** client shell (sidebar, mobile top bar, user menu, theme toggle) and Admin shell (Home, Client workspace tabs, drawer).
6. **Invoices:** schema + counters, Admin authoring/Paid/revert/Void, Client Invoices list and detail, Overview Invoice panel and KPIs.
7. **GitHub sync:** GitHub App, `PmSource` adapter, board refetch + upsert, webhook endpoint, reconcile poll via Vercel Cron, unassigned-board pool, linking + column mapping, board detail with sync state and "Sync now", unlink/relink, Project delete.
8. **Client Projects:** Projects list, Project view (Status Update timeline, Milestones, Tasks), Past Projects, Overview Projects panel and KPIs.
9. **Requests:** schema, Client submit/edit/withdraw drawer and list, Admin inbox and triage, Task link with "no longer tracked".
10. **Hardening:** accessibility and responsive checklists from `DESIGN.md`, Neon paid upgrade before the first real Client, moving personal-account boards to the org.

Slices 6 and 7 are independent once 2–5 land; 9 depends on 7 only for the Task link.

## Open gaps

All resolved; each names the ticket that settled it.

1. ~~**Reconcile poll interval**~~ Resolved by [Settle the ops and infra gaps][#22]: every 15 minutes.
2. ~~**Migrator role and role passwords**~~ Resolved by [#22][#22]: migrate as `neondb_owner`; a post-migrate step sets role passwords from secrets.
3. ~~**Admin identity and bootstrap**~~ Resolved by [Settle the auth and access gaps][#23]: `ADMIN_EMAIL` env var; magic link grants passkey enrollment only.
4. ~~**Last-Owner override**~~ Resolved by [Settle the auth and access gaps][#23]: no override; the rule binds the Admin too.
5. ~~**Reverting Paid**~~ Resolved by [Settle the Invoice gaps][#24]: yes, with confirmation; a status change, not an edit; clears `paid_at`.
6. ~~**Overdue and date timezone**~~ Resolved by [#24][#24]: one business timezone, `America/New_York`; Overdue from the day after the due date.
7. ~~**Line Item amounts**~~ Resolved by [#24][#24]: non-zero, negatives allowed for discounts; total must be > 0.
8. ~~**Task link after Project delete**~~ Resolved by [Settle the GitHub sync and Project gaps][#25]: `task_id` set null, `task_title` snapshot kept; shows "(no longer tracked)", same as a hidden Task.
9. ~~**Sync failure detection**~~ Resolved by [#25][#25]: `last_sync_error` set, or `last_synced_at` older than 1 hour; warnings don't count.
10. ~~**"Needs attention" dot**~~ Resolved by [#25][#25]: replaced by per-reason alert icons: New Requests (with count), sync problem, Overdue Invoice.
11. ~~**Closed GitHub boards**~~ Resolved by [#25][#25]: a closed linked board is a Past Project; it keeps syncing and reopening revives it.
12. ~~**Items with no Status value**~~ Resolved by [#25][#25]: Up next, no flag.
13. ~~**Members and the Team page**~~ Resolved by [Settle the auth and access gaps][#23]: Members see a read-only roster.
14. ~~**Profile page**~~ Resolved by [Settle the auth and access gaps][#23]: editable display name; rest read-only; Leave Client.
15. ~~**Archived Client sign-in**~~ Resolved by [Settle the auth and access gaps][#23]: sessions revoked at archive; sign-in refused.
16. ~~**Microsoft sign-in scope**~~ Resolved by [Settle the auth and access gaps][#23]: work/school and personal (`common`).
17. ~~**Local GitHub sync**~~ Resolved by [#22][#22]: a dev GitHub App on real boards, webhooks via smee.io.
18. ~~**Observability**~~ Resolved by [#22][#22]: Vercel logs only in v1.

[#1]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/1 "Client dashboard v1: wayfinder map"
[#2]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/2 "Which PM tool should feed client-facing project status?"
[#3]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/3 "Which stack, DB and hosting fit Auth.js for a multi-tenant portal?"
[#4]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/4 "What does a Client User see for a Project?"
[#5]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/5 "Who within a Client can invite and remove Client Users?"
[#7]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/7 "How does the Admin add Invoices and update their status?"
[#8]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/8 "Are messaging and per-client branding in v1?"
[#9]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/9 "Lock the PM tool and how status syncs"
[#10]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/10 "Lock the stack, DB and hosting"
[#11]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/11 "Auth.js or Better Auth?"
[#12]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/12 "How do Client Users submit bugs and requests?"
[#13]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/13 "App-level tenant scoping alone, or plus Postgres RLS?"
[#14]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/14 "Which transactional email sender for magic links and Invitations?"
[#15]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/15 "How do we set up SES on the Neves Labs domain?"
[#16]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/16 "What is the v1 data model?"
[#17]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/17 "How do environments, CI and deploy work?"
[#18]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/18 "What is the visual direction (DESIGN.md)?"
[#19]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/19 "What does the Admin area look like?"
[#20]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/20 "Assemble the v1 spec"
[#21]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/21 "Does the RLS role design work on Neon?"
[#22]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/22 "Settle the ops and infra gaps"
[#23]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/23 "Settle the auth and access gaps"
[#24]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/24 "Settle the Invoice gaps"
[#25]: https://github.com/Neves-Labs-Inc/client-dashboard/issues/25 "Settle the GitHub sync and Project gaps"
