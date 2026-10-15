CREATE TYPE "public"."project_health" AS ENUM('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'COMPLETE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."task_client_status" AS ENUM('UP_NEXT', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TABLE "github_boards" (
	"node_id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"closed" boolean NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_boards_url_github" CHECK ("github_boards"."url" LIKE 'https://github.com/%')
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	CONSTRAINT "milestones_project_id_title_key" UNIQUE("project_id","title"),
	CONSTRAINT "milestones_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "milestones_id_project_id_client_id_key" UNIQUE("id","project_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_status_mappings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"github_option_id" text NOT NULL,
	"option_name" text NOT NULL,
	"client_status" "task_client_status",
	CONSTRAINT "project_status_mappings_project_id_github_option_id_key" UNIQUE("project_id","github_option_id")
);
--> statement-breakpoint
ALTER TABLE "project_status_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"github_project_node_id" text NOT NULL,
	"github_project_number" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"closed_on_github" boolean DEFAULT false NOT NULL,
	"unlinked_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"sync_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "projects_client_id_github_project_node_id_key" UNIQUE("client_id","github_project_node_id"),
	CONSTRAINT "projects_url_github" CHECK ("projects"."url" LIKE 'https://github.com/%')
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "status_updates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"github_node_id" text NOT NULL,
	"health" "project_health",
	"start_date" date,
	"target_date" date,
	"body" text DEFAULT '' NOT NULL,
	"github_created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "status_updates_project_id_github_node_id_key" UNIQUE("project_id","github_node_id")
);
--> statement-breakpoint
ALTER TABLE "status_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"github_item_node_id" text NOT NULL,
	"github_issue_node_id" text NOT NULL,
	"github_repository_node_id" text NOT NULL,
	"title" text NOT NULL,
	"client_note" text,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"status_option_id" text,
	"hidden_at" timestamp with time zone,
	CONSTRAINT "tasks_project_id_github_item_node_id_key" UNIQUE("project_id","github_item_node_id"),
	CONSTRAINT "tasks_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_mappings" ADD CONSTRAINT "project_status_mappings_project_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_project_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_fk" FOREIGN KEY ("milestone_id","project_id","client_id") REFERENCES "public"."milestones"("id","project_id","client_id") ON DELETE SET NULL ("milestone_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_linked_board_key" ON "projects" USING btree ("github_project_node_id") WHERE "projects"."unlinked_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_github_issue_node_id_idx" ON "tasks" USING btree ("github_issue_node_id");--> statement-breakpoint
CREATE INDEX "tasks_github_repository_node_id_idx" ON "tasks" USING btree ("github_repository_node_id");--> statement-breakpoint
CREATE POLICY "milestones_tenant_isolation" ON "milestones" AS PERMISSIVE FOR ALL TO public USING ("milestones"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("milestones"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "project_status_mappings_tenant_isolation" ON "project_status_mappings" AS PERMISSIVE FOR ALL TO public USING ("project_status_mappings"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("project_status_mappings"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "projects_tenant_isolation" ON "projects" AS PERMISSIVE FOR ALL TO public USING ("projects"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("projects"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "status_updates_tenant_isolation" ON "status_updates" AS PERMISSIVE FOR ALL TO public USING ("status_updates"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("status_updates"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ("tasks"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("tasks"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
-- Custom SQL (Drizzle can't express it). Above, tasks_milestone_fk was edited
-- by hand to SET NULL ("milestone_id"): Drizzle's plain SET NULL would null
-- project_id and client_id too, which are NOT NULL, so deleting a milestone
-- would fail.
-- FORCE makes RLS apply to the table owner too (see 0001_clients.sql).
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "status_updates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "milestones" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "project_status_mappings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON "projects", "status_updates", "milestones", "tasks", "project_status_mappings" TO app_tenant;
--> statement-breakpoint
-- DELETE: sync deletes milestones, and the Admin deletes Projects.
GRANT SELECT, INSERT, UPDATE, DELETE ON "projects", "status_updates", "milestones", "tasks", "project_status_mappings" TO app_system;
--> statement-breakpoint
-- The org's boards, with no client_id and no RLS: a grant would show every
-- Client's boards to app_tenant. Explicit, so a stray default privilege can't
-- grant it either.
GRANT SELECT, INSERT, UPDATE, DELETE ON "github_boards" TO app_system;
--> statement-breakpoint
REVOKE ALL ON "github_boards" FROM app_tenant;