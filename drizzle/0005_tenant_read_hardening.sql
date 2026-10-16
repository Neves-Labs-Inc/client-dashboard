-- Client read paths (Phase 5) run as app_tenant, and the Phase 4 security
-- review found it could read every column of the board tables and hidden
-- Tasks. This narrows its SELECT on clients and the board tables to the
-- columns a Client may see, and the restrictive policy tasks_tenant_visible
-- hides Tasks with hidden_at set. app_system (BYPASSRLS, full CRUD) is
-- unchanged: the sync and the Admin still see everything.
CREATE POLICY "tasks_tenant_visible" ON "tasks" AS RESTRICTIVE FOR SELECT TO "app_tenant" USING ("tasks"."hidden_at" IS NULL);--> statement-breakpoint
-- Custom SQL (Drizzle can't express column grants). Column-level, so a column
-- added later stays hidden from app_tenant until granted here. A `select *`
-- as app_tenant on a table with hidden columns fails with permission denied.
REVOKE SELECT ON "clients", "projects", "status_updates", "milestones", "tasks", "project_status_mappings" FROM app_tenant;
--> statement-breakpoint
-- Every column today (0001 granted it table-wide), still listed so a new one
-- isn't granted by default.
GRANT SELECT ("id", "archived_at", "created_at") ON "clients" TO app_tenant;
--> statement-breakpoint
-- Hidden: GitHub ids and link, sync diagnostics.
GRANT SELECT ("id", "client_id", "name", "closed_on_github", "unlinked_at", "created_at") ON "projects" TO app_tenant;
--> statement-breakpoint
-- Hidden: github_node_id.
GRANT SELECT ("id", "client_id", "project_id", "health", "start_date", "target_date", "body", "github_created_at") ON "status_updates" TO app_tenant;
--> statement-breakpoint
-- Every column today, still listed so a new one isn't granted by default.
GRANT SELECT ("id", "client_id", "project_id", "title", "due_date") ON "milestones" TO app_tenant;
--> statement-breakpoint
-- Hidden: GitHub item, issue and repository ids.
GRANT SELECT ("id", "client_id", "project_id", "milestone_id", "title", "client_note", "target_date", "completed_at", "status_option_id", "hidden_at") ON "tasks" TO app_tenant;
--> statement-breakpoint
-- Hidden: option_name, the internal board column name.
GRANT SELECT ("id", "client_id", "project_id", "github_option_id", "client_status") ON "project_status_mappings" TO app_tenant;
