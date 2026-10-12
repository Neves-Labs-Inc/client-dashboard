-- Roles are cluster-wide and one cluster holds both the dev and test
-- databases, so creation is guarded. Passwords are set by the migrate command
-- from env, never here. app_tenant must stay subject to RLS: no BYPASSRLS and
-- never a member of neon_superuser.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_system') THEN
    CREATE ROLE app_system LOGIN BYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- A role that already existed (made by hand, an old experiment) may carry the
-- wrong attributes, so set them whether or not the guard created it. The
-- migrate command re-applies them on every run.
ALTER ROLE app_tenant LOGIN NOBYPASSRLS;
--> statement-breakpoint
ALTER ROLE app_system LOGIN BYPASSRLS;
--> statement-breakpoint
-- Table grants come per table, in each table's migration.
GRANT USAGE ON SCHEMA public TO app_tenant, app_system;
