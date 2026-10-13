import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

export * from "./auth-schema";

// Unset or empty app.client_id becomes NULL, so the check matches no row and
// allows no write (ADR 0003).
const CURRENT_CLIENT_ID = sql`NULLIF(current_setting('app.client_id', true), '')::uuid`;

// A Client's name lives on Better Auth's `organization`, whose id this row
// shares. FORCE RLS and the grants are in the migration's custom SQL: Drizzle
// can't express them.
export const clients = pgTable(
  "clients",
  {
    // No default: it is the organization's id. No cascade: Clients are
    // archive-only.
    id: uuid("id")
      .primaryKey()
      .references(() => organization.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    pgPolicy("clients_tenant_isolation", {
      for: "all",
      using: sql`${table.id} = ${CURRENT_CLIENT_ID}`,
      withCheck: sql`${table.id} = ${CURRENT_CLIENT_ID}`,
    }),
  ],
);
