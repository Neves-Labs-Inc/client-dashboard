import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Throws unless getAppEnv fails, naming `name` and never echoing `value`.
function expectRejected(name: string, value: string | undefined): void {
  let message = "";
  try {
    getAppEnv();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  expect(message).toContain(name);
  if (value) {
    expect(message).not.toContain(value);
  }
}

describe("getAppEnv", () => {
  it("rejects a DB_QUERY_TIMEOUT_MS above ten minutes, naming the var", () => {
    // Above 2^31-1 ms Node clamps timers to 1ms, so every query would fail.
    vi.stubEnv("DB_QUERY_TIMEOUT_MS", "2147483648");

    expect(() => getAppEnv()).toThrow(/DB_QUERY_TIMEOUT_MS/);
  });

  it("accepts a DB_QUERY_TIMEOUT_MS of exactly ten minutes", () => {
    vi.stubEnv("DB_QUERY_TIMEOUT_MS", "600000");

    expect(getAppEnv().DB_QUERY_TIMEOUT_MS).toBe(600_000);
  });

  it("reads the auth and mail settings from the test env", () => {
    const env = getAppEnv();

    expect(env).toMatchObject({
      BETTER_AUTH_URL: "http://localhost:5173",
      ADMIN_EMAIL: "admin@test.local",
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      MAIL_FROM: "portal@localhost.test",
    });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it("rejects a missing BETTER_AUTH_SECRET", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);

    expectRejected("BETTER_AUTH_SECRET", undefined);
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 chars without echoing it", () => {
    const secret = "short-secret-value-xyz";
    vi.stubEnv("BETTER_AUTH_SECRET", secret);

    expectRejected("BETTER_AUTH_SECRET", secret);
  });

  it("rejects a BETTER_AUTH_URL with a trailing slash or a path", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:5173/");
    expectRejected("BETTER_AUTH_URL", undefined);

    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:5173/app");
    expectRejected("BETTER_AUTH_URL", undefined);
  });

  it("rejects a plain-http BETTER_AUTH_URL for any host but localhost", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://portal.example.test");

    expectRejected("BETTER_AUTH_URL", undefined);
  });

  it("accepts https anywhere and plain http on localhost", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://portal.example.test");
    expect(getAppEnv().BETTER_AUTH_URL).toBe("https://portal.example.test");

    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
    expect(getAppEnv().BETTER_AUTH_URL).toBe("http://127.0.0.1:3000");
  });

  it("rejects a BETTER_AUTH_URL that isn't http(s)", () => {
    vi.stubEnv("BETTER_AUTH_URL", "ftp://portal.example.test");

    expectRejected("BETTER_AUTH_URL", undefined);
  });

  it("rejects an ADMIN_EMAIL that isn't an email", () => {
    vi.stubEnv("ADMIN_EMAIL", "not-an-email");

    expectRejected("ADMIN_EMAIL", "not-an-email");
  });

  it("rejects an SMTP_PORT outside 1-65535", () => {
    vi.stubEnv("SMTP_PORT", "65536");

    expectRejected("SMTP_PORT", undefined);
  });

  it("rejects SMTP_USER without SMTP_PASSWORD, without echoing it", () => {
    const user = "mailer-user@example.test";
    vi.stubEnv("SMTP_USER", user);

    expectRejected("SMTP_PASSWORD", user);
  });

  it("rejects SMTP_PASSWORD without SMTP_USER, without echoing it", () => {
    const password = "app-password-value";
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_PASSWORD", password);

    expectRejected("SMTP_USER", password);
  });

  it("rejects SMTP_PASSWORD with a port other than 465, without echoing it", () => {
    const password = "app-password-value";
    vi.stubEnv("SMTP_USER", "mailer-user@example.test");
    vi.stubEnv("SMTP_PASSWORD", password);
    vi.stubEnv("SMTP_PORT", "587");

    expectRejected("SMTP_PORT", password);
  });

  it("accepts SMTP credentials on port 465", () => {
    vi.stubEnv("SMTP_USER", "mailer-user@example.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password-value");
    vi.stubEnv("SMTP_PORT", "465");

    expect(getAppEnv()).toMatchObject({
      SMTP_PORT: 465,
      SMTP_USER: "mailer-user@example.test",
      SMTP_PASSWORD: "app-password-value",
    });
  });
  it("leaves Google off when neither Google var is set", () => {
    const env = getAppEnv();

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("rejects GOOGLE_CLIENT_ID without GOOGLE_CLIENT_SECRET", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");

    expectRejected("GOOGLE_CLIENT_SECRET", undefined);
  });

  it("rejects GOOGLE_CLIENT_SECRET without GOOGLE_CLIENT_ID, without echoing it", () => {
    const secret = "GOCSPX-google-secret-value";
    vi.stubEnv("GOOGLE_CLIENT_SECRET", secret);

    expectRejected("GOOGLE_CLIENT_ID", secret);
  });

  it("accepts both Google vars", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "GOCSPX-google-secret-value");

    expect(getAppEnv()).toMatchObject({
      GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-google-secret-value",
    });
  });
});
