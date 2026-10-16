# App-level Client scoping with a Postgres RLS backstop

Every query against Client-owned data goes through one tenant-aware data module that takes the `clientId` explicitly. For a Client User, that id comes from a membership lookup on each request. Postgres row-level security backs the module up: when a query skips the scoping, Postgres still returns only that Client's rows, because leaking one Client's Invoices to another is the worst failure this app can have, and adding RLS after the schema exists is harder than starting with it.

The database has three roles. A migrator role owns the tables. `app_tenant` runs Client User traffic and is subject to RLS (`ENABLE` + `FORCE`). Each tenant request runs in one transaction that sets `app.client_id` locally, and policies are a plain equality check on `current_setting('app.client_id', true)`, so an unset value returns no rows. `app_system` has `BYPASSRLS` and runs the Admin's routes (always, including inside a single Client's pages), the GitHub sync, and Better Auth. Choosing a pool is choosing whether to bypass, so a stray setting can't open other Clients' data. Every Client-owned table carries its own `client_id`, Line Items and Tasks included, with a composite foreign key to its parent so it can't drift. Better Auth's tables have no RLS and are reached only through `app_system`. Integration tests against real Postgres check that, as `app_tenant` with Client A set, no read returns Client B's rows and no write into Client B is allowed.

Write policies that check who writes (Requests, Phase 6) read `app.user_id` the same way: `withTenant` sets it transaction-locally with `set_config(..., true)`, and the policies trust it as they trust `app.client_id`. Any session can set both itself, so this backstop guards against app bugs, not SQL injection on a tenant path, which could impersonate another user of the same Client.

## Considered options

- **App-level scoping only**: the simplest fit for Drizzle and Better Auth, but one unscoped query leaks data with nothing in the database to stop it.
- **RLS only**: the least scoping code, but a missing `SET LOCAL` fails silently, and the Admin and sync paths are harder to reason about.
- **One role with a bypass flag**: one pool, but a stray `SET app.bypass` would open every Client's data.
- **Admin on `app_tenant` inside a Client**: a smaller bypass surface, but the Admin would need a tenant context and there would be two code paths.
- **Child-row policies that join to the parent**: less duplication, but slower policies that differ per table.
