import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthSettings } from "@/lib/auth/auth-env";
import { getAppEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAuthSettings", () => {
  it("trusts X-Forwarded-For on Vercel (VERCEL set)", () => {
    vi.stubEnv("VERCEL", "1");

    expect(getAuthSettings(getAppEnv()).trustForwardedFor).toBe(true);
  });

  it("doesn't trust X-Forwarded-For off Vercel (VERCEL unset)", () => {
    vi.stubEnv("VERCEL", undefined);

    expect(getAuthSettings(getAppEnv()).trustForwardedFor).toBe(false);
  });

  it("takes the Admin, base URL and secret from env", () => {
    const env = getAppEnv();

    expect(getAuthSettings(env)).toMatchObject({
      adminEmail: "admin@test.local",
      baseUrl: "http://localhost:5173",
      secret: env.BETTER_AUTH_SECRET,
    });
  });
  it("registers no social provider when the Google vars are unset", () => {
    expect(getAuthSettings(getAppEnv()).providers).toEqual({});
  });

  it("registers Google, recording google sessions, when both vars are set", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "GOCSPX-google-secret-value");

    expect(getAuthSettings(getAppEnv()).providers).toEqual({
      google: {
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "GOCSPX-google-secret-value",
        signInMethod: "google",
      },
    });
  });
});
