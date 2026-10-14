import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppEnv } from "@/lib/env";

// Shape only; not a real key.
const PRIVATE_KEY_PEM = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "MIIEowIBAAKCAQEAtestonlynotarealkey",
  "-----END RSA PRIVATE KEY-----",
].join("\n");

function stubGithubEnv(): void {
  vi.stubEnv("GITHUB_APP_ID", "123456");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", PRIVATE_KEY_PEM);
  vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "987654");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "webhook-secret-value");
  vi.stubEnv("GITHUB_ORG", "Neves-Labs-Inc");
}

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
  it("leaves GitHub off when no GitHub var is set", () => {
    const env = getAppEnv();

    expect(env.GITHUB_APP_ID).toBeUndefined();
    expect(env.GITHUB_APP_PRIVATE_KEY).toBeUndefined();
    expect(env.GITHUB_APP_INSTALLATION_ID).toBeUndefined();
    expect(env.GITHUB_WEBHOOK_SECRET).toBeUndefined();
    expect(env.GITHUB_ORG).toBeUndefined();
  });

  it("rejects a partial GitHub config, naming each missing var without echoing the set ones", () => {
    const secret = "webhook-secret-value";
    vi.stubEnv("GITHUB_APP_ID", "123456");
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", secret);

    let message = "";
    try {
      getAppEnv();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("GITHUB_APP_PRIVATE_KEY");
    expect(message).toContain("GITHUB_APP_INSTALLATION_ID");
    expect(message).toContain("GITHUB_ORG");
    expect(message).not.toContain("GITHUB_APP_ID ");
    expect(message).not.toContain("GITHUB_WEBHOOK_SECRET");
    expect(message).not.toContain(secret);
  });

  it("accepts all five GitHub vars", () => {
    stubGithubEnv();

    expect(getAppEnv()).toMatchObject({
      GITHUB_APP_ID: "123456",
      GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY_PEM,
      GITHUB_APP_INSTALLATION_ID: 987654,
      GITHUB_WEBHOOK_SECRET: "webhook-secret-value",
      GITHUB_ORG: "Neves-Labs-Inc",
    });
  });

  it("turns literal \\n escapes in the GitHub private key into newlines", () => {
    stubGithubEnv();
    vi.stubEnv(
      "GITHUB_APP_PRIVATE_KEY",
      PRIVATE_KEY_PEM.replaceAll("\n", "\\n"),
    );

    expect(getAppEnv().GITHUB_APP_PRIVATE_KEY).toBe(PRIVATE_KEY_PEM);
  });

  it("accepts a GitHub private key with CRLF line endings", () => {
    stubGithubEnv();
    vi.stubEnv(
      "GITHUB_APP_PRIVATE_KEY",
      PRIVATE_KEY_PEM.replaceAll("\n", "\r\n"),
    );

    expect(getAppEnv().GITHUB_APP_PRIVATE_KEY).toBe(PRIVATE_KEY_PEM);
  });

  it("rejects a GitHub private key that isn't a PEM, without echoing it", () => {
    const notAKey = "not-a-private-key-value";
    stubGithubEnv();
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", notAKey);

    expectRejected("GITHUB_APP_PRIVATE_KEY", notAKey);
  });

  it("rejects a GITHUB_APP_INSTALLATION_ID that isn't a positive integer", () => {
    stubGithubEnv();
    vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "12ab");
    expectRejected("GITHUB_APP_INSTALLATION_ID", undefined);

    vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "0");
    expectRejected("GITHUB_APP_INSTALLATION_ID", undefined);
  });
});
