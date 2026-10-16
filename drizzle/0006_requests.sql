CREATE TYPE "public"."request_kind" AS ENUM('BUG', 'FEATURE');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('NEW', 'ACCEPTED', 'DECLINED', 'DONE', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"submitter_id" uuid NOT NULL,
	"kind" "request_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "request_status" DEFAULT 'NEW' NOT NULL,
	"response_note" text,
	"task_id" uuid,
	"task_title" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_title_length" CHECK (char_length("requests"."title") BETWEEN 1 AND 200),
	CONSTRAINT "requests_description_length" CHECK (char_length("requests"."description") BETWEEN 1 AND 5000),
	CONSTRAINT "requests_response_note_length" CHECK ("requests"."response_note" IS NULL OR char_length("requests"."response_note") BETWEEN 1 AND 5000),
	CONSTRAINT "requests_task_link_status" CHECK (("requests"."task_id" IS NULL AND "requests"."task_title" IS NULL) OR "requests"."status" IN ('ACCEPTED', 'DONE')),
	CONSTRAINT "requests_task_title_present" CHECK ("requests"."task_id" IS NULL OR "requests"."task_title" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_submitter_id_user_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_project_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE SET NULL ("project_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_task_fk" FOREIGN KEY ("task_id","client_id") REFERENCES "public"."tasks"("id","client_id") ON DELETE SET NULL ("task_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_client_id_created_at_idx" ON "requests" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "requests_tenant_isolation" ON "requests" AS PERMISSIVE FOR ALL TO public USING ("requests"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("requests"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "requests_tenant_insert" ON "requests" AS RESTRICTIVE FOR INSERT TO "app_tenant" WITH CHECK ("requests"."submitter_id" = NULLIF(current_setting('app.user_id', true), '')::uuid AND "requests"."status" = 'NEW');--> statement-breakpoint
CREATE POLICY "requests_tenant_update" ON "requests" AS RESTRICTIVE FOR UPDATE TO "app_tenant" USING ("requests"."status" = 'NEW' AND "requests"."submitter_id" = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("requests"."status" IN ('NEW', 'WITHDRAWN') AND "requests"."submitter_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- Custom SQL (Drizzle can't express it). Above, requests_project_fk and
-- requests_task_fk were edited by hand to SET NULL ("project_id") and
-- SET NULL ("task_id"): Drizzle's plain SET NULL would null client_id too,
-- which is NOT NULL, so deleting a Project or Task would fail.
-- FORCE makes RLS apply to the table owner too (see 0001_clients.sql).
ALTER TABLE "requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Explicit, so a stray default privilege can't widen app_tenant's grants below.
REVOKE ALL ON "requests" FROM app_tenant;
--> statement-breakpoint
-- Column-level, so a column added later stays closed to app_tenant until
-- granted here. Every column today is readable.
GRANT SELECT ("id", "client_id", "project_id", "submitter_id", "kind", "title", "description", "status", "response_note", "task_id", "task_title", "status_changed_at", "created_at") ON "requests" TO app_tenant;
--> statement-breakpoint
-- A Client User submits a Request; status, the response note and the Task
-- link take their defaults. The restrictive requests_tenant_insert policy
-- checks the submitter.
GRANT INSERT ("client_id", "project_id", "submitter_id", "kind", "title", "description") ON "requests" TO app_tenant;
--> statement-breakpoint
-- Edit and withdraw. Never the response note or the Task link: those are the
-- Admin's. Never status_changed_at: requests_status_changed_at sets it, so a
-- Client User can't backdate it. requests_tenant_update limits which rows and
-- which statuses.
GRANT UPDATE ("project_id", "kind", "title", "description", "status") ON "requests" TO app_tenant;
--> statement-breakpoint
-- status_changed_at follows every actual status change, whoever writes it
-- (withdraw as app_tenant, triage as app_system). Insert takes the column
-- default. A trigger's assignment needs no column grant.
CREATE FUNCTION "requests_set_status_changed_at"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."status_changed_at" := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "requests_status_changed_at" BEFORE UPDATE ON "requests"
FOR EACH ROW EXECUTE FUNCTION "requests_set_status_changed_at"();
--> statement-breakpoint
-- No DELETE for app_tenant: withdrawing is an UPDATE. The Admin triages as
-- app_system.
GRANT SELECT, INSERT, UPDATE, DELETE ON "requests" TO app_system;
