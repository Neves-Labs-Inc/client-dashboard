CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clients_tenant_isolation" ON "clients" AS PERMISSIVE FOR ALL TO public USING ("clients"."id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("clients"."id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
-- Custom SQL (Drizzle can't express it). FORCE makes RLS apply to the table
-- owner too, unless it has BYPASSRLS: BYPASSRLS roles skip RLS entirely, and
-- that includes app_system and the owner (neondb_owner) itself.
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON "clients" TO app_tenant;
--> statement-breakpoint
-- No DELETE: Clients are archive-only (archived_at).
GRANT SELECT, INSERT, UPDATE ON "clients" TO app_system;
