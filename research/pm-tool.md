# Which PM tool should feed client-facing Project status?

Research for [#2](https://github.com/Neves-Labs-Inc/client-dashboard/issues/2), part of map [#1](https://github.com/Neves-Labs-Inc/client-dashboard/issues/1). Researched 2026-10-09 from official docs, pricing pages, and the live GraphQL schemas.

## Recommendation

**Stay on GitHub Projects (v2), owned by the `Neves-Labs-Inc` org, and sync it with a GitHub App. Put the sync behind a small `PmSource` adapter so moving to Linear later only means writing a second adapter.**

Why:

1. **It costs nothing and changes nothing.** The org is on GitHub Free (`gh api orgs/Neves-Labs-Inc` returns `plan: free`), and Free includes Issues & Projects and unlimited private repos [S1]. Linear Free caps the workspace at 250 issues [S7], which several Clients would outgrow, so in practice Linear means Basic ($10/user/mo) or Business ($16/user/mo) [S7].
2. **It already has a client-facing status signal.** Project status updates use the enum `INACTIVE | ON_TRACK | AT_RISK | OFF_TRACK | COMPLETE`, plus start and target dates and a Markdown body [S4, S5]. That is the same "health + note" shape Linear offers.
3. **Server-side auth is clean.** A GitHub App installation token with the org **Projects: read** permission (plus **Issues: read** on the relevant repos) needs no human user token [S2, S3]. Its limit is 5,000 GraphQL points/hr per installation [S6].
4. **Webhooks exist, with a caveat.** `projects_v2`, `projects_v2_item` and `projects_v2_status_update` fire for **organization-level projects only**, and GitHub marks project webhooks as **"currently in public preview and subject to change"** [S2]. So the sync should be webhook-triggered **plus** a periodic reconcile poll.
5. **Hiding internal work is opt-in by construction.** A Project only shows the items someone adds to it. A custom single-select field (for example `Client visibility: Visible / Internal`) makes the rule explicit, and the sync whitelists `Visible` [S3].

**Runner-up: Linear.** Its model fits the dashboard more naturally: first-class project status categories, milestones with computed progress, and project updates with health [S9, S10, S11, S12]. It also has a client-credentials `actor=app` token for server-to-server sync [S13], and webhooks for Projects and Project updates [S8]. The cost is a migration plus a paid plan. Switch only if GitHub's preview-status project webhooks prove unreliable, or if work tracking moves off GitHub anyway.

**Considered and not pursued:** Jira, Asana and similar tools. GitHub (already in use, free) and Linear (best model fit) dominate them for a one-person shop, and adopting any of them means a migration as well as a new bill.

## Comparison

| Criterion | GitHub Projects v2 | Linear |
|---|---|---|
| API | GraphQL (`api.github.com/graphql`). Projects v2 is GraphQL-first, and REST covers org project items [S3, S2b] | GraphQL. Personal API keys or OAuth2 [S14] |
| Webhooks | `projects_v2`, `projects_v2_item`, `projects_v2_status_update`, **org-owned projects only, public preview** [S2]. `issues`, `milestone` and `sub_issues` are GA at repo/org level [S2] | Issues, Projects, Project updates, Initiatives, Cycles, Customers, and more. HMAC-SHA256 `Linear-Signature`. 3 retries (1m / 1h / 6h), and the webhook may be auto-disabled [S8]. Creating webhooks needs a workspace admin or the OAuth `admin` scope [S8] |
| Project-level status | Custom `Status` single-select on items, plus project **status updates** (`ON_TRACK / AT_RISK / OFF_TRACK / COMPLETE / INACTIVE`, start/target date, Markdown body) [S3, S4, S5] | `ProjectStatusType`: `backlog / planned / started / paused / completed / canceled`, with customizable names [S9, S12]. Project updates with health `onTrack / atRisk / offTrack` [S11, S12] |
| Milestones | Repo milestones (issue-level, per repo). Iteration fields on projects [S3] | Project milestones: name, optional target date, % progress computed from issues [S10] |
| Hiding internal work | Curated: only items added to the Project appear. Add a `Client visibility` custom field. Items the token can't see come back as `REDACTED` [S3] | Labels or project scoping. Private teams exist but need **Business+** [S15] and leak to any API key whose owner is a member [S15] |
| Server-side auth | GitHub App installation token. Org "Projects" read permission [S2b]. `read:project` scope for PATs [S3] | `client_credentials` grant gives an `actor=app` token covering all public teams, valid 30 days, no refresh token [S13]. Or OAuth with 24h access and refresh tokens [S13] |
| Rate limits | 5,000 points/hr per installation, scaling up to 12,500 [S6] | OAuth app: 5,000 req/hr and 2M complexity/hr. API key: 2,500 req/hr [S16] |
| Cost | Free plan: Issues & Projects and unlimited private repos [S1] | Free: 250 issues, 2 teams. Basic $10, Business $16 per user/mo, billed yearly [S7]. "API and webhook access" is listed under Core features [S7] |
| Switching cost | None (in use today) | Migrate issues and boards, plus a new subscription |

## Entity mapping sketch (GitHub)

Convention: **one GitHub Project (v2) per dashboard Project**, owned by the `Neves-Labs-Inc` org. Each Client's dashboard Project rows point at a `ProjectV2` node ID.

| Dashboard (CONTEXT.md) | GitHub source | Notes |
|---|---|---|
| **Client** | *Not in GitHub.* Dashboard-owned record | An Admin links a Client to one or more ProjectV2 IDs. Don't infer the tenant from GitHub data |
| **Project** | `ProjectV2` (`id`, `title`, `shortDescription`, `closed`, `url`) | `closed` means archived or finished |
| Project **health** | Latest `ProjectV2StatusUpdate.status` | `ON_TRACK` maps to "On track", `AT_RISK` to "At risk", `OFF_TRACK` to "Off track", `COMPLETE` to "Done", `INACTIVE` to "Paused" |
| Project **dates** | Latest status update `startDate` / `targetDate` | |
| Project **update note** | Latest status update `body` (Markdown) | The Admin writes it with the client as the audience. Render it sanitized |
| **Milestones / phases** | `Iteration` field, or a single-select `Phase` field on items | Prefer a project field over repo milestones, because repo milestones can't span repos |
| **Work items** (optional) | `ProjectV2Item` where `Client visibility = Visible` | Show title and `Status` field only. Never show the body, comments or assignees by default |
| Item status | `Status` single-select option name | Map option names to a small client vocabulary (To do / In progress / Done) |

Sync flow: `projects_v2*` webhook → verify the signature → enqueue a refetch of that ProjectV2 over GraphQL → upsert into the DB. A cron reconcile (for example every 15 min) covers missed deliveries, since the webhooks are in preview.

Linear equivalent (if switching): Project → Linear `Project`, health → latest `ProjectUpdate.health`, lifecycle → `ProjectStatus.type`, phases → `ProjectMilestone` with its progress, visible items → issues with a `client-visible` label.

## Open questions surfaced

- **Some client boards are user-owned.** `gh project list` shows three org-owned Projects (Client Dashboard, TutorLink, Thais Neves Cleaning Solutions), but others (for example Vertilux Shade Calculator) are owned by `@franklinnevesfilho`. Project webhooks only fire for org-level projects [S2], so any client board on the personal account must move to (or be recreated under) `Neves-Labs-Inc`.
- **Granularity shown to Clients:** project-level health, dates and note only, or also a filtered item list? This decides whether the `Client visibility` field is needed at all.
- **Preview risk:** the `projects_v2*` webhooks are public preview. The reconcile poll is the mitigation, and its cadence ties to the hosting decision (cron availability).
- **Client ↔ ProjectV2 linking UX** belongs to the Admin UI ticket.

## Sources

- [S1] GitHub pricing: https://github.com/pricing
- [S2] GitHub webhook events and payloads (`projects_v2`, `projects_v2_item`, `projects_v2_status_update`, `issues`, `milestone`, `sub_issues`): https://docs.github.com/en/webhooks/webhook-events-and-payloads
- [S2b] Permissions required for GitHub Apps ("Organization permissions for Projects"): https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
- [S3] Using the API to manage Projects: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- [S4] Sharing project updates: https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/sharing-project-updates
- [S5] GitHub GraphQL schema, `ProjectV2StatusUpdateStatus` enum (verified by live introspection, `gh api graphql`): https://docs.github.com/en/graphql/reference/enums
- [S6] GitHub GraphQL rate limits: https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
- [S7] Linear pricing: https://linear.app/pricing
- [S8] Linear webhooks: https://linear.app/developers/webhooks
- [S9] Linear project status: https://linear.app/docs/project-status
- [S10] Linear project milestones: https://linear.app/docs/project-milestones
- [S11] Linear initiative and project updates: https://linear.app/docs/initiative-and-project-updates
- [S12] Linear SDK GraphQL schema (`ProjectStatusType`, `ProjectUpdateHealthType`): https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql
- [S13] Linear OAuth 2.0 (scopes, `actor=app`, client credentials): https://linear.app/developers/oauth-2-0-authentication
- [S14] Linear GraphQL API: https://linear.app/developers/graphql
- [S15] Linear private teams: https://linear.app/docs/private-teams
- [S16] Linear rate limiting: https://linear.app/developers/rate-limiting
