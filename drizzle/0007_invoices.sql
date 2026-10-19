CREATE TYPE "public"."invoice_status" AS ENUM('OPEN', 'PAID', 'VOID');--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_seq" integer NOT NULL,
	CONSTRAINT "invoice_counters_last_seq_range" CHECK ("invoice_counters"."last_seq" BETWEEN 1 AND 9999)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"number" text NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"memo" text,
	"status" "invoice_status" DEFAULT 'OPEN' NOT NULL,
	"paid_at" date,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "invoices_number_format" CHECK (CASE WHEN "invoices"."number" ~ '^NL-[0-9]{4}-[0-9]{4}$' THEN right("invoices"."number", 4)::int = extract(year from "invoices"."issue_date") ELSE false END),
	CONSTRAINT "invoices_due_after_issue" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_memo_length" CHECK ("invoices"."memo" IS NULL OR char_length("invoices"."memo") BETWEEN 1 AND 2000),
	CONSTRAINT "invoices_paid_at_status" CHECK (("invoices"."status" = 'PAID') = ("invoices"."paid_at" IS NOT NULL)),
	CONSTRAINT "invoices_paid_after_issue" CHECK ("invoices"."paid_at" IS NULL OR "invoices"."paid_at" >= "invoices"."issue_date")
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "line_items_invoice_id_position_key" UNIQUE("invoice_id","position"),
	CONSTRAINT "line_items_position_range" CHECK ("line_items"."position" BETWEEN 1 AND 50),
	CONSTRAINT "line_items_description_length" CHECK (char_length("line_items"."description") BETWEEN 1 AND 200),
	CONSTRAINT "line_items_amount_range" CHECK ("line_items"."amount_cents" <> 0 AND abs("line_items"."amount_cents") <= 100000000)
);
--> statement-breakpoint
ALTER TABLE "line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE SET NULL ("project_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_invoice_fk" FOREIGN KEY ("invoice_id","client_id") REFERENCES "public"."invoices"("id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_client_id_issue_date_idx" ON "invoices" USING btree ("client_id","issue_date" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO public USING ("invoices"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("invoices"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invoices_tenant_not_void" ON "invoices" AS RESTRICTIVE FOR SELECT TO "app_tenant" USING ("invoices"."status" <> 'VOID');--> statement-breakpoint
CREATE POLICY "line_items_tenant_isolation" ON "line_items" AS PERMISSIVE FOR ALL TO public USING ("line_items"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid) WITH CHECK ("line_items"."client_id" = NULLIF(current_setting('app.client_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "line_items_tenant_not_void" ON "line_items" AS RESTRICTIVE FOR SELECT TO "app_tenant" USING (EXISTS (SELECT 1 FROM "invoices" i WHERE i."id" = "line_items"."invoice_id" AND i."status" <> 'VOID'));--> statement-breakpoint
-- Custom SQL (Drizzle can't express it). Above, invoices_project_fk was edited
-- by hand to SET NULL ("project_id"): Drizzle's plain SET NULL would null
-- client_id too, which is NOT NULL, so deleting a Project would fail.
-- FORCE makes RLS apply to the table owner too (see 0001_clients.sql).
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "line_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Explicit, so a stray default privilege can't widen app_tenant's grants below.
-- invoice_counters gets nothing: numbering is the Admin's.
REVOKE ALL ON "invoices", "line_items", "invoice_counters" FROM app_tenant;
--> statement-breakpoint
-- Column-level, so a column added later stays closed to app_tenant until
-- granted here. Every column today is readable; invoices_tenant_not_void and
-- line_items_tenant_not_void hide Void Invoices. No INSERT, UPDATE or DELETE:
-- Client Users only read Invoices.
GRANT SELECT ("id", "client_id", "project_id", "number", "issue_date", "due_date", "memo", "status", "paid_at", "status_changed_at", "created_at") ON "invoices" TO app_tenant;
--> statement-breakpoint
GRANT SELECT ("id", "client_id", "invoice_id", "position", "description", "amount_cents") ON "line_items" TO app_tenant;
--> statement-breakpoint
-- The backstop for "an issued Invoice is never edited": app_system may only
-- change an Invoice's status and paid date, and never deletes. Line Items are
-- write-once. status_changed_at needs no grant: the trigger below sets it.
GRANT SELECT, INSERT ON "invoices" TO app_system;
--> statement-breakpoint
GRANT UPDATE ("status", "paid_at") ON "invoices" TO app_system;
--> statement-breakpoint
GRANT SELECT, INSERT ON "line_items" TO app_system;
--> statement-breakpoint
-- The create path's upsert takes the year's row lock and bumps last_seq.
GRANT SELECT, INSERT, UPDATE ON "invoice_counters" TO app_system;
--> statement-breakpoint
-- status_changed_at follows every actual status change (Paid, reverted, Void).
-- Insert takes the column default. Void is final: a Void Invoice going back
-- to Open or Paid would reappear to Client Users.
CREATE FUNCTION "invoices_set_status_changed_at"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD."status" = 'VOID' AND NEW."status" IS DISTINCT FROM 'VOID' THEN
    RAISE EXCEPTION 'Invoice % is Void; Void is final', OLD."number"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."status_changed_at" := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "invoices_status_changed_at" BEFORE UPDATE ON "invoices"
FOR EACH ROW EXECUTE FUNCTION "invoices_set_status_changed_at"();
--> statement-breakpoint
-- An Invoice has at least one Line Item and a total above zero. Deferred to
-- commit, so the create path can insert the Invoice before its Line Items; a
-- buggy write that leaves an empty or non-positive Invoice rolls back whole.
CREATE FUNCTION "invoices_check_line_items"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  line_count integer;
  total_cents bigint;
BEGIN
  SELECT count(*), coalesce(sum("amount_cents"), 0)
    INTO line_count, total_cents
    FROM "public"."line_items"
    WHERE "invoice_id" = NEW."id";
  IF line_count = 0 OR total_cents <= 0 THEN
    RAISE EXCEPTION 'Invoice % needs at least one Line Item and a total above zero (has %, totalling % cents)',
      NEW."number", line_count, total_cents
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "invoices_line_items_present" AFTER INSERT ON "invoices"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "invoices_check_line_items"();
--> statement-breakpoint
-- An issued Invoice is never edited, so Line Items go in only in the
-- transaction that inserted their Invoice (its xmin is the current
-- transaction's id). Insert the Invoice outside any savepoint: a row written
-- inside one carries the subtransaction's id and is refused here. An UPDATE
-- of the Invoice earlier in the same transaction also passes; fine for a
-- backstop. AFTER, so a tenant's RLS WITH CHECK refuses its insert first.
CREATE FUNCTION "line_items_only_with_invoice"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "public"."invoices" i
    WHERE i."id" = NEW."invoice_id"
      AND i.xmin::text = (pg_current_xact_id()::xid)::text
  ) THEN
    RAISE EXCEPTION 'Line Items are added only with their Invoice (Invoice %)',
      NEW."invoice_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "line_items_only_with_invoice" AFTER INSERT ON "line_items"
FOR EACH ROW EXECUTE FUNCTION "line_items_only_with_invoice"();
