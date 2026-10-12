import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// Unset or empty app.client_id becomes NULL, so the check matches no row and
// allows no write (ADR 0003).
const CURRENT_CLIENT_ID = sql`NULLIF(current_setting('app.client_id', true), '')::uuid`;

// A Client's name lives on Better Auth's `organization` (Phase 2), whose id
// this row will share. FORCE RLS and the grants are in the migration's custom
// SQL: Drizzle can't express them.
export const clients = pgTable(
  "clients",
  {
    // No default: Phase 2 sets it to organization.id and adds that FK.
    id: uuid("id").primaryKey(),
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
