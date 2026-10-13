import type { AppEnv } from "@/lib/env";

type AuthSettings = {
  adminEmail: string;
  baseUrl: string;
  secret: string;
  trustForwardedFor: boolean;
};

// The env-derived part of createAuth's deps, for the server-only instance.
// Only Vercel overwrites X-Forwarded-For with the client IP, so only there is
// it trusted; on a self-hosted image it is client-controlled.
export function getAuthSettings(env: AppEnv): AuthSettings {
  return {
    adminEmail: env.ADMIN_EMAIL,
    baseUrl: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustForwardedFor: env.VERCEL,
  };
}
