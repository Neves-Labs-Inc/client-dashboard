-- Phase 3: sessions can also be proven by Google. Adding a provider later
-- widens this check again (one value per provider's sign-in method).
ALTER TABLE "session" DROP CONSTRAINT "session_sign_in_method_check";--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_sign_in_method_check" CHECK ("session"."sign_in_method" in ('magic-link', 'passkey', 'google'));
