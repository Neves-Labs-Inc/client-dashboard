import { randomInt, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { APIError } from "better-auth/api";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { type Access, type Auth, createAuth } from "@/lib/auth/auth";
import { createInvitationEligibilityHook } from "@/lib/auth/invite-eligibility";
import { createDb } from "@/lib/db/db";
import {
  clients,
  invitation,
  member,
  organization,
  passkey,
  rateLimit,
  session,
  user,
  verification,
} from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { FakeMailer } from "@/lib/mailer/fake-mailer";
import { SoftAuthenticator } from "../../support/soft-authenticator";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SESSION_DAYS = 90;
const MAGIC_LINK_LIMIT = 5;
const MAGIC_LINK_HOURLY_CAP = 10;
const PASSKEY_OPTIONS_LIMIT = 10;
const SESSION_MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60;
// Better Auth's fallback when no client IP is trusted (test and dev mode).
const FALLBACK_IP = "127.0.0.1";
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const env = getAppEnv();
const baseUrl = env.BETTER_AUTH_URL;
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const mailer = new FakeMailer();
// The module hands the quota check and send to this instead of awaiting
// them; the helpers below settle them so each test sees the outcome.
const backgroundTasks: Promise<void>[] = [];
const authDeps = {
  db,
  mailer,
  runInBackground: (task: Promise<void>) => {
    backgroundTasks.push(task);
  },
  adminEmail: env.ADMIN_EMAIL,
  baseUrl,
  secret: env.BETTER_AUTH_SECRET,
};
// As on Vercel: X-Forwarded-For is trusted.
const auth = createAuth({ ...authDeps, trustForwardedFor: true });
// As self-hosted: X-Forwarded-For is client-controlled and ignored.
const untrustedAuth = createAuth({ ...authDeps, trustForwardedFor: false });
const usedIps: string[] = [];

afterEach(async () => {
  await settleBackgroundTasks();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mailer.sent.length = 0;
  mailer.failWith = null;
  await deleteAuthRows();
});

afterAll(async () => {
  await db.close();
});

// As the owner, like the RLS harness. Deleting the user cascades to its
// sessions; magic-link verifications, the email quota and this file's
// rate-limit rows go too.
async function deleteAuthRows(): Promise<void> {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await owner.query('delete from "user"');
    await owner.query(
      "delete from verification where identifier like 'magic-link:%'",
    );
    // Passkey challenges are keyed by a random token, not an identifier.
    await owner.query(
      `delete from verification where value like '%"expectedChallenge"%'`,
    );
    await owner.query("delete from email_send_quota");
    await owner.query(
      "delete from rate_limit where split_part(key, '|', 1) = any($1::text[])",
      [[...usedIps.splice(0), FALLBACK_IP]],
    );
  } finally {
    await owner.end();
  }
}

// Each test signs in from its own IP so rate limits never cross tests.
function createIp(): string {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  usedIps.push(ip);
  return ip;
}

async function settleBackgroundTasks(): Promise<void> {
  await Promise.all(backgroundTasks.splice(0));
}

// `forwardedFor` is the X-Forwarded-For value as it reaches the app. Resolves
// once any email it triggers has gone out (or been skipped).
async function requestMagicLink(
  email: string,
  forwardedFor: string,
  via: Auth = auth,
): Promise<Response> {
  const response = await postMagicLinkRequest(email, forwardedFor, via);
  await settleBackgroundTasks();
  return response;
}

function postMagicLinkRequest(
  email: string,
  forwardedFor: string,
  via: Auth = auth,
): Promise<Response> {
  return via.handler(
    new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-forwarded-for": forwardedFor,
      },
      body: JSON.stringify({ email, callbackURL: "/" }),
    }),
  );
}

async function requestStatuses(
  forwardedFors: string[],
  via: Auth = auth,
): Promise<number[]> {
  const statuses: number[] = [];
  for (const forwardedFor of forwardedFors) {
    const response = await requestMagicLink(env.ADMIN_EMAIL, forwardedFor, via);
    statuses.push(response.status);
  }
  return statuses;
}

function getLinkFromLastMessage(): string {
  const message = mailer.sent.at(-1);
  const match = message?.text.match(/portal: (\S+)\. It expires/);
  if (!match) throw new Error("no magic link in the last message");
  return match[1];
}

function followLink(link: string, ip: string): Promise<Response> {
  return auth.handler(
    new Request(link, { headers: { "x-forwarded-for": ip } }),
  );
}

// The Cookie header a browser would send back after `response`.
function getCookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function pageRequest(cookie: string | null): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${baseUrl}/`, { headers });
}

async function getAccessFor(cookie: string | null): Promise<Access> {
  const { access } = await auth.getAccess(pageRequest(cookie));
  return access;
}

async function signInWithMagicLink(ip: string): Promise<string> {
  await requestMagicLink(env.ADMIN_EMAIL, ip);
  const response = await followLink(getLinkFromLastMessage(), ip);
  return getCookieHeader(response);
}

// What a browser holds after `response`: `cookie` (a Cookie header) with
// each Set-Cookie applied, cleared cookies dropped.
function applySetCookies(cookie: string, response: Response): string {
  const jar = new Map(
    cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => splitCookie(pair)),
  );
  for (const header of response.headers.getSetCookie()) {
    const [name, value] = splitCookie(header.split(";")[0]);
    if (value === "" || /max-age=0/i.test(header)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function splitCookie(pair: string): [string, string] {
  const separator = pair.indexOf("=");
  return [pair.slice(0, separator), pair.slice(separator + 1)];
}

// A browser request to Better Auth: same-origin, from `ip`.
function apiRequest(
  path: string,
  cookie: string,
  ip: string,
  body?: unknown,
): Request {
  const headers = new Headers({ origin: baseUrl, "x-forwarded-for": ip });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${baseUrl}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Ceremony = { response: Response; cookie: string };
type CeremonyOptions = { userVerified?: boolean; credentialId?: string };

// passkey.addPasskey() as the browser client runs it.
async function registerPasskey(
  authenticator: SoftAuthenticator,
  cookie: string,
  ip: string,
  options: CeremonyOptions = {},
): Promise<Ceremony> {
  const optionsResponse = await auth.handler(
    apiRequest("/passkey/generate-register-options", cookie, ip),
  );
  const withChallenge = applySetCookies(cookie, optionsResponse);
  const credential = authenticator.createCredential(
    await optionsResponse.json(),
    options,
  );
  const response = await auth.handler(
    apiRequest("/passkey/verify-registration", withChallenge, ip, {
      response: credential,
    }),
  );
  return { response, cookie: applySetCookies(withChallenge, response) };
}

// signIn.passkey() as the browser client runs it.
async function signInWithPasskey(
  authenticator: SoftAuthenticator,
  cookie: string,
  ip: string,
  options: CeremonyOptions = {},
): Promise<Ceremony> {
  const optionsResponse = await auth.handler(
    apiRequest("/passkey/generate-authenticate-options", cookie, ip),
  );
  const withChallenge = applySetCookies(cookie, optionsResponse);
  const assertion = authenticator.getAssertion(
    await optionsResponse.json(),
    options,
  );
  const response = await auth.handler(
    apiRequest("/passkey/verify-authentication", withChallenge, ip, {
      response: assertion,
    }),
  );
  return { response, cookie: applySetCookies(withChallenge, response) };
}

function createAuthenticator(): SoftAuthenticator {
  return new SoftAuthenticator(new URL(baseUrl).hostname, baseUrl);
}

function readUsers() {
  return db.withSystem((tx) => tx.select().from(user));
}

describe("magic-link request", () => {
  it("emails ADMIN_EMAIL, in any letter case, exactly one link under BETTER_AUTH_URL", async () => {
    const response = await requestMagicLink(
      env.ADMIN_EMAIL.toUpperCase(),
      createIp(),
    );

    expect(response.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    const [message] = mailer.sent;
    const link = getLinkFromLastMessage();
    expect(link.startsWith(`${baseUrl}/api/auth/magic-link/verify?`)).toBe(
      true,
    );
    expect(message).toEqual({
      to: env.ADMIN_EMAIL,
      subject: "Your Neves Labs portal sign-in link",
      text: `Use this link to sign in to the Neves Labs client portal: ${link}. It expires in 15 minutes and works once. If you didn't ask for it, you can ignore this email.`,
      html: `<p>Use this link to sign in to the Neves Labs client portal: <a href="${link.replaceAll("&", "&amp;")}">${link.replaceAll("&", "&amp;")}</a>. It expires in 15 minutes and works once. If you didn't ask for it, you can ignore this email.</p>`,
    });
  });

  it("answers before the Admin's email goes out, so timing reveals nothing", async () => {
    const response = await postMagicLinkRequest(env.ADMIN_EMAIL, createIp());

    expect(response.status).toBe(200);
    expect(mailer.sent).toEqual([]);

    await settleBackgroundTasks();
    expect(mailer.sent).toHaveLength(1);
  });

  it("gives any other email the same response, sends nothing and creates no user", async () => {
    const ip = createIp();
    const adminResponse = await requestMagicLink(env.ADMIN_EMAIL, ip);
    mailer.sent.length = 0;

    const otherResponse = await requestMagicLink("someone@example.test", ip);

    expect(otherResponse.status).toBe(adminResponse.status);
    expect(await otherResponse.json()).toEqual(await adminResponse.json());
    expect(mailer.sent).toEqual([]);
    expect(await readUsers()).toEqual([]);
  });

  it("still answers normally when the mailer fails, logging no address", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mailer.failWith = new Error(`SMTP refused ${env.ADMIN_EMAIL}`);

    const response = await requestMagicLink(env.ADMIN_EMAIL, createIp());

    expect(response.status).toBe(200);
    const output = logged.mock.calls.flat().join("\n");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(output).toMatch(/magic-link email failed/);
    expect(output).not.toContain(env.ADMIN_EMAIL);
  });

  it("stores the link's token only hashed", async () => {
    await requestMagicLink(env.ADMIN_EMAIL, createIp());
    const token = new URL(getLinkFromLastMessage()).searchParams.get("token");

    const rows = await db.withSystem((tx) => tx.select().from(verification));

    expect(token).toBeTruthy();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("answers the 6th request from one IP within 60 s with 429", async () => {
    const ip = createIp();

    const statuses = await requestStatuses(
      Array.from({ length: MAGIC_LINK_LIMIT + 1 }, () => ip),
    );

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("keys the limit on the last X-Forwarded-For hop, not a spoofed first one", async () => {
    const ip = createIp();
    const spoofed = Array.from(
      { length: MAGIC_LINK_LIMIT + 1 },
      () => `${createIp()}, ${ip}`,
    );

    const statuses = await requestStatuses(spoofed);

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("ignores X-Forwarded-For off Vercel, so rotating it doesn't reset the limit", async () => {
    const rotated = Array.from({ length: MAGIC_LINK_LIMIT + 1 }, () =>
      createIp(),
    );

    const statuses = await requestStatuses(rotated, untrustedAuth);

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("sends ADMIN_EMAIL at most 10 links an hour, whatever the IPs, with the same response", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ips = Array.from({ length: MAGIC_LINK_HOURLY_CAP + 1 }, () =>
      createIp(),
    );

    const statuses = await requestStatuses(ips);

    expect(statuses).toEqual(ips.map(() => 200));
    expect(mailer.sent).toHaveLength(MAGIC_LINK_HOURLY_CAP);

    vi.setSystemTime(Date.now() + 61 * MINUTE_MS);
    await requestMagicLink(env.ADMIN_EMAIL, createIp());

    expect(mailer.sent).toHaveLength(MAGIC_LINK_HOURLY_CAP + 1);
  });
});

describe("following the magic link", () => {
  it("signs the Admin in with a session that only allows passkey registration", async () => {
    const cookie = await signInWithMagicLink(createIp());

    const access = await getAccessFor(cookie);

    expect(access).toEqual({
      kind: "admin-needs-passkey",
      email: env.ADMIN_EMAIL,
    });
  });

  it("creates a session that expires about 90 days out", async () => {
    const before = Date.now();

    await signInWithMagicLink(createIp());

    const [row] = await db.withSystem((tx) => tx.select().from(session));
    const expected = before + SESSION_DAYS * DAY_MS;
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(expected);
    expect(row.expiresAt.getTime()).toBeLessThan(expected + MINUTE_MS);
  });

  it("leaves every id to Postgres, which makes UUIDv7s", async () => {
    const ip = createIp();
    await signInWithMagicLink(ip);

    const ids = await db.withSystem(async (tx) => {
      const users = await tx.select({ id: user.id }).from(user);
      const sessions = await tx.select({ id: session.id }).from(session);
      const limits = await tx
        .select({ id: rateLimit.id })
        .from(rateLimit)
        .where(sql`split_part(${rateLimit.key}, '|', 1) = ${ip}`);
      return [...users, ...sessions, ...limits].map((row) => row.id);
    });

    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ids) {
      expect(id).toMatch(UUID_V7);
    }
  });

  it("refuses a link that was already used", async () => {
    const ip = createIp();
    await requestMagicLink(env.ADMIN_EMAIL, ip);
    const link = getLinkFromLastMessage();
    await followLink(link, ip);

    const reused = await followLink(link, ip);

    expect(reused.headers.get("location")).toMatch(/error=INVALID_TOKEN/);
    expect(getCookieHeader(reused)).not.toMatch(/session_token=\w/);
  });

  it("refuses a link older than 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    const ip = createIp();
    await requestMagicLink(env.ADMIN_EMAIL, ip);
    const link = getLinkFromLastMessage();
    vi.setSystemTime(Date.now() + 16 * MINUTE_MS);

    const expired = await followLink(link, ip);

    expect(expired.headers.get("location")).toMatch(/error=INVALID_TOKEN/);
    expect(getCookieHeader(expired)).not.toMatch(/session_token=\w/);
    expect(await db.withSystem((tx) => tx.select().from(session))).toEqual([]);
  });

  it("accepts a link just under 15 minutes old", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    const ip = createIp();
    await requestMagicLink(env.ADMIN_EMAIL, ip);
    const link = getLinkFromLastMessage();
    vi.setSystemTime(Date.now() + 14 * MINUTE_MS);

    const response = await followLink(link, ip);

    const access = await getAccessFor(getCookieHeader(response));
    expect(access.kind).toBe("admin-needs-passkey");
  });
});

describe("getAccess", () => {
  it("is anonymous without a session cookie", async () => {
    expect(await getAccessFor(null)).toEqual({
      kind: "anonymous",
    });
  });

  it("is anonymous with a forged session cookie", async () => {
    const forged = "better-auth.session_token=not-a-real-token.signature";

    expect(await getAccessFor(forged)).toEqual({
      kind: "anonymous",
    });
  });

  it("is admin for a passkey session", async () => {
    const cookie = await signInWithMagicLink(createIp());
    // The WebAuthn ceremony can't run here (qa-visual covers it), so the
    // session is marked as the passkey endpoint would create it.
    await db.withSystem((tx) =>
      tx
        .update(session)
        .set({ signInMethod: "passkey" })
        .where(eq(session.signInMethod, "magic-link")),
    );

    expect(await getAccessFor(cookie)).toEqual({
      kind: "admin",
      email: env.ADMIN_EMAIL,
    });
  });

  it("renews the session cookie once the session is over a day old", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    const cookie = await signInWithMagicLink(createIp());
    const fresh = await auth.getAccess(pageRequest(cookie));
    vi.setSystemTime(Date.now() + 2 * DAY_MS);

    const slid = await auth.getAccess(pageRequest(cookie));

    expect(fresh.headers.getSetCookie()).toEqual([]);
    expect(slid.access.kind).toBe("admin-needs-passkey");
    const renewed = slid.headers
      .getSetCookie()
      .find((header) => header.includes("session_token="));
    expect(renewed).toMatch(new RegExp(`Max-Age=${SESSION_MAX_AGE_S}`));
    const [row] = await db.withSystem((tx) => tx.select().from(session));
    const expected = Date.now() + SESSION_DAYS * DAY_MS;
    expect(row.expiresAt.getTime()).toBeGreaterThan(expected - MINUTE_MS);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(expected);
  });

  it("is anonymous once the session has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    const cookie = await signInWithMagicLink(createIp());
    vi.setSystemTime(Date.now() + (SESSION_DAYS + 1) * DAY_MS);

    expect(await getAccessFor(cookie)).toEqual({
      kind: "anonymous",
    });
  });
});

describe("passkey", () => {
  it("signs the Admin in with a passkey registered from the magic-link session", async () => {
    const ip = createIp();
    const authenticator = createAuthenticator();
    const magicLinkCookie = await signInWithMagicLink(ip);

    const registration = await registerPasskey(
      authenticator,
      magicLinkCookie,
      ip,
    );
    const signIn = await signInWithPasskey(
      authenticator,
      registration.cookie,
      ip,
    );

    expect(registration.response.status).toBe(200);
    expect(signIn.response.status).toBe(200);
    expect(await getAccessFor(signIn.cookie)).toEqual({
      kind: "admin",
      email: env.ADMIN_EMAIL,
    });
  });

  it("revokes the magic-link session once the passkey session exists", async () => {
    const ip = createIp();
    const authenticator = createAuthenticator();
    const magicLinkCookie = await signInWithMagicLink(ip);
    const registration = await registerPasskey(
      authenticator,
      magicLinkCookie,
      ip,
    );

    await signInWithPasskey(authenticator, registration.cookie, ip);

    expect(await getAccessFor(magicLinkCookie)).toEqual({ kind: "anonymous" });
    const sessions = await db.withSystem((tx) => tx.select().from(session));
    expect(sessions.map((row) => row.signInMethod)).toEqual(["passkey"]);
  });

  it("refuses a sign-in the authenticator didn't user-verify", async () => {
    const ip = createIp();
    const authenticator = createAuthenticator();
    const magicLinkCookie = await signInWithMagicLink(ip);
    const registration = await registerPasskey(
      authenticator,
      magicLinkCookie,
      ip,
    );

    const signIn = await signInWithPasskey(
      authenticator,
      registration.cookie,
      ip,
      { userVerified: false },
    );

    expect(signIn.response.status).toBeGreaterThanOrEqual(400);
    expect((await getAccessFor(signIn.cookie)).kind).toBe(
      "admin-needs-passkey",
    );
  });

  it("refuses to register a passkey the authenticator didn't user-verify", async () => {
    const ip = createIp();
    const authenticator = createAuthenticator();
    const magicLinkCookie = await signInWithMagicLink(ip);

    const registration = await registerPasskey(
      authenticator,
      magicLinkCookie,
      ip,
      { userVerified: false },
    );

    expect(registration.response.status).toBeGreaterThanOrEqual(400);
    expect(await db.withSystem((tx) => tx.select().from(passkey))).toEqual([]);
  });

  it("refuses to start a passkey registration without a session", async () => {
    const response = await auth.handler(
      apiRequest("/passkey/generate-register-options", "", createIp()),
    );

    expect(response.status).toBe(401);
  });

  it("refuses to register a passkey from a passkey session", async () => {
    const ip = createIp();
    const authenticator = createAuthenticator();
    const registration = await registerPasskey(
      authenticator,
      await signInWithMagicLink(ip),
      ip,
    );
    const signIn = await signInWithPasskey(
      authenticator,
      registration.cookie,
      ip,
    );

    const second = await registerPasskey(
      createAuthenticator(),
      signIn.cookie,
      ip,
    );

    expect(second.response.status).toBe(403);
    const passkeys = await db.withSystem((tx) => tx.select().from(passkey));
    expect(passkeys).toHaveLength(1);
  });

  it("answers the 11th sign-in options request from one IP within 60 s with 429", async () => {
    const ip = createIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < PASSKEY_OPTIONS_LIMIT + 1; attempt += 1) {
      const response = await auth.handler(
        apiRequest("/passkey/generate-authenticate-options", "", ip),
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, PASSKEY_OPTIONS_LIMIT)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });

  it("closes the session and passkey endpoints the portal doesn't use", async () => {
    const ip = createIp();
    const cookie = await signInWithMagicLink(ip);
    const closed = [
      apiRequest("/passkey/list-user-passkeys", cookie, ip),
      apiRequest("/passkey/delete-passkey", cookie, ip, { id: "x" }),
      apiRequest("/passkey/update-passkey", cookie, ip, { id: "x", name: "y" }),
      apiRequest("/list-sessions", cookie, ip),
      apiRequest("/revoke-sessions", cookie, ip, {}),
      apiRequest("/revoke-other-sessions", cookie, ip, {}),
      apiRequest("/update-user", cookie, ip, { name: "Mallory" }),
    ];

    const statuses: number[] = [];
    for (const request of closed) {
      statuses.push((await auth.handler(request)).status);
    }
    const getSession = await auth.handler(
      apiRequest("/get-session", cookie, ip),
    );

    expect(statuses).toEqual(closed.map(() => 404));
    expect(getSession.status).toBe(200);
  });

  it("registers a second passkey from a fresh magic link, and both sign in", async () => {
    const ip = createIp();
    const firstDevice = createAuthenticator();
    const secondDevice = createAuthenticator();
    await registerPasskey(firstDevice, await signInWithMagicLink(ip), ip);

    const second = await registerPasskey(
      secondDevice,
      await signInWithMagicLink(ip),
      ip,
    );
    const firstSignIn = await signInWithPasskey(firstDevice, "", ip);
    const secondSignIn = await signInWithPasskey(secondDevice, "", ip);

    expect(second.response.status).toBe(200);
    expect((await getAccessFor(firstSignIn.cookie)).kind).toBe("admin");
    expect((await getAccessFor(secondSignIn.cookie)).kind).toBe("admin");
  });

  it("gives a passkey session for any other email no access", async () => {
    const ip = createIp();
    const authenticator = createAuthenticator();
    await registerPasskey(authenticator, await signInWithMagicLink(ip), ip);
    // No other email can get an account, so the Admin's passkey is moved to
    // one made directly.
    await db.withSystem(async (tx) => {
      const [other] = await tx
        .insert(user)
        .values({ name: "Other", email: "other@test.local" })
        .returning();
      await tx.update(passkey).set({ userId: other.id });
    });

    const signIn = await signInWithPasskey(authenticator, "", ip);

    expect(signIn.response.status).toBe(200);
    expect(await getAccessFor(signIn.cookie)).toEqual({ kind: "anonymous" });
  });
});

describe("signOut", () => {
  it("revokes the session and returns headers that clear the cookie", async () => {
    const cookie = await signInWithMagicLink(createIp());

    const headers = await auth.signOut(pageRequest(cookie));

    expect(headers.getSetCookie().join("\n")).toMatch(
      /session_token=;.*Max-Age=0/i,
    );
    expect(await getAccessFor(cookie)).toEqual({
      kind: "anonymous",
    });
    expect(await db.withSystem((tx) => tx.select().from(session))).toEqual([]);
  });

  it("fails, leaving the cookie, when the session can't be revoked", async () => {
    const cookie = await signInWithMagicLink(createIp());
    const unreachableDb = {
      ...db,
      withSystem: () => Promise.reject(new Error("connection lost")),
    };
    const brokenAuth = createAuth({
      ...authDeps,
      db: unreachableDb,
      trustForwardedFor: true,
    });

    await expect(brokenAuth.signOut(pageRequest(cookie))).rejects.toThrow();
    expect((await getAccessFor(cookie)).kind).toBe("admin-needs-passkey");
  });

  it("is harmless without a session", async () => {
    const headers = await auth.signOut(pageRequest(null));

    expect(headers).toBeInstanceOf(Headers);
  });
});

// Shared by the Client tests: rows they insert are cleaned up after each.
describe("Clients", () => {
  const NOW = new Date("2026-10-12T12:00:00Z");
  // Names are unique per run: other test files insert Clients concurrently.
  const prefix = `lc-${randomUUID().slice(0, 8)}`;
  const clientIds: string[] = [];
  let now = NOW;
  const clock = createAuth({
    ...authDeps,
    trustForwardedFor: true,
    now: () => now,
  });

  afterEach(async () => {
    now = NOW;
    const owner = new pg.Client({
      connectionString: getMigrateEnv().DATABASE_URL_OWNER,
    });
    await owner.connect();
    try {
      const ids = clientIds.splice(0);
      await owner.query(
        "delete from invitation where organization_id = any($1::uuid[])",
        [ids],
      );
      await owner.query(
        "delete from member where organization_id = any($1::uuid[])",
        [ids],
      );
      await owner.query("delete from clients where id = any($1::uuid[])", [
        ids,
      ]);
      await owner.query("delete from organization where id = any($1::uuid[])", [
        ids,
      ]);
      await owner.query('delete from "user" where email like $1', [
        `${prefix}%`,
      ]);
    } finally {
      await owner.end();
    }
  });

  async function addClient(
    name: string,
    options: { archivedAt?: Date } = {},
  ): Promise<string> {
    const id = randomUUID();
    clientIds.push(id);
    await db.withSystem(async (tx) => {
      await tx.insert(organization).values({
        id,
        name: `${prefix} ${name}`,
        slug: id,
        createdAt: NOW,
      });
      await tx
        .insert(clients)
        .values({ id, createdAt: NOW, archivedAt: options.archivedAt });
    });
    return id;
  }

  async function addUser(email: string): Promise<string> {
    const [row] = await db.withSystem((tx) =>
      tx
        .insert(user)
        .values({ name: email, email: `${prefix}${email}` })
        .returning({ id: user.id }),
    );
    return row.id;
  }

  async function addMember(
    organizationId: string,
    email: string,
    role: string,
    createdAt: Date = NOW,
  ): Promise<void> {
    const userId = await addUser(email);
    await db.withSystem((tx) =>
      tx.insert(member).values({ organizationId, userId, role, createdAt }),
    );
  }

  async function addInvitation(
    organizationId: string,
    options: {
      status?: string;
      expiresAt: Date;
      createdAt?: Date;
      email?: string;
    },
  ): Promise<string> {
    const inviterId = await addUser(`-inviter-${randomUUID()}@example.test`);
    const [row] = await db.withSystem((tx) =>
      tx
        .insert(invitation)
        .values({
          organizationId,
          email: "invitee@example.test",
          role: "owner",
          inviterId,
          ...options,
        })
        .returning({ id: invitation.id }),
    );
    return row.id;
  }

  async function listMine() {
    const all = await clock.listClients();
    return all.filter((client) => client.name.startsWith(prefix));
  }

  describe("listClients", () => {
    it("sorts by name, ignoring case", async () => {
      await addClient("banana");
      await addClient("Cherry");
      await addClient("Apple");

      const names = (await listMine()).map((client) => client.name);

      expect(names).toEqual([
        `${prefix} Apple`,
        `${prefix} banana`,
        `${prefix} Cherry`,
      ]);
    });

    it("counts every member of the Client", async () => {
      const id = await addClient("Acme");
      await addMember(id, "-a@example.test", "owner");
      await addMember(id, "-b@example.test", "member");
      await addMember(id, "-c@example.test", "member");

      const [acme] = await listMine();

      expect(acme).toMatchObject({ id, userCount: 3, createdAt: NOW });
    });

    it("shows the Owner's email, the earliest when there are several", async () => {
      const id = await addClient("Acme");
      await addMember(
        id,
        "-late@example.test",
        "owner",
        new Date("2026-10-02"),
      );
      await addMember(
        id,
        "-early@example.test",
        "owner",
        new Date("2026-10-01"),
      );
      await addMember(
        id,
        "-plain@example.test",
        "member",
        new Date("2026-09-01"),
      );

      const [acme] = await listMine();

      expect(acme.owner).toEqual({ email: `${prefix}-early@example.test` });
    });

    it("marks the Owner pending while an invitation is live", async () => {
      const id = await addClient("Acme");
      await addInvitation(id, { expiresAt: new Date(NOW.getTime() + DAY_MS) });

      const [acme] = await listMine();

      expect(acme.owner).toEqual({ pending: true });
    });

    it("has no Owner once the invitation expires", async () => {
      const id = await addClient("Acme");
      await addInvitation(id, { expiresAt: new Date(NOW.getTime() + DAY_MS) });
      now = new Date(NOW.getTime() + 2 * DAY_MS);

      const [acme] = await listMine();

      expect(acme.owner).toBeNull();
    });

    it("ignores invitations that are no longer pending", async () => {
      const id = await addClient("Acme");
      await addInvitation(id, {
        status: "accepted",
        expiresAt: new Date(NOW.getTime() + DAY_MS),
      });

      const [acme] = await listMine();

      expect(acme.owner).toBeNull();
    });

    it("prefers the Owner over a pending invitation", async () => {
      const id = await addClient("Acme");
      await addMember(id, "-owner@example.test", "owner");
      await addInvitation(id, { expiresAt: new Date(NOW.getTime() + DAY_MS) });

      const [acme] = await listMine();

      expect(acme.owner).toEqual({ email: `${prefix}-owner@example.test` });
    });

    it("has no Owner and no users for a new Client", async () => {
      await addClient("Acme");

      const [acme] = await listMine();

      expect(acme).toMatchObject({ userCount: 0, owner: null });
    });

    it("leaves out archived Clients", async () => {
      await addClient("Active");
      await addClient("Gone", { archivedAt: NOW });

      const names = (await listMine()).map((client) => client.name);

      expect(names).toEqual([`${prefix} Active`]);
    });
  });

  describe("createClient", () => {
    async function create(name: string) {
      const result = await clock.createClient(name);
      if (result.value) clientIds.push(result.value.clientId);
      return result;
    }

    async function countNamed(name: string): Promise<number> {
      const rows = await db.withSystem((tx) =>
        tx
          .select({ id: organization.id })
          .from(organization)
          .where(sql`lower(${organization.name}) = lower(${name})`),
      );
      return rows.length;
    }

    it("creates the organization and clients rows with one UUIDv7, and no member", async () => {
      const result = await create(`${prefix} Acme`);

      const id = result.value?.clientId ?? "";
      const [org] = await db.withSystem((tx) =>
        tx.select().from(organization).where(eq(organization.id, id)),
      );
      const clientRows = await db.withSystem((tx) =>
        tx.select().from(clients).where(eq(clients.id, id)),
      );
      const members = await db.withSystem((tx) =>
        tx.select().from(member).where(eq(member.organizationId, id)),
      );
      expect(result).toMatchObject({ error: null, status: 201 });
      expect(id).toMatch(UUID_V7);
      expect(org).toMatchObject({ name: `${prefix} Acme`, slug: id });
      expect(clientRows).toHaveLength(1);
      expect(members).toEqual([]);
    });

    it("trims the name", async () => {
      const result = await create(`   ${prefix} Acme  `);

      const [acme] = (await clock.listClients()).filter(
        (client) => client.id === result.value?.clientId,
      );
      expect(acme.name).toBe(`${prefix} Acme`);
    });

    it("accepts a 1-character and a 100-character name", async () => {
      // The prefix keeps the long one unique across concurrent runs.
      const longName = `${prefix} `.padEnd(100, "x");

      const short = await create("Z");
      const long = await create(longName);

      expect(short).toMatchObject({ error: null, status: 201 });
      expect(long).toMatchObject({ error: null, status: 201 });
    });

    it("refuses a blank or 101-character name, creating nothing", async () => {
      const tooLong = `${prefix} `.padEnd(101, "x");

      const blank = await create("   ");
      const long = await create(tooLong);

      expect(blank).toEqual({
        value: null,
        error: "invalid-name",
        status: 422,
      });
      expect(long).toEqual({ value: null, error: "invalid-name", status: 422 });
      expect(await countNamed(tooLong)).toBe(0);
    });

    it("refuses a name another Client has in any letter case, creating nothing", async () => {
      await create(`${prefix} Acme`);

      const spaced = await create(`  ${prefix} acme `);
      const upper = await create(`${prefix} ACME`);

      expect(spaced).toEqual({
        value: null,
        error: "duplicate-name",
        status: 409,
      });
      expect(upper.error).toBe("duplicate-name");
      expect(await countNamed(`${prefix} Acme`)).toBe(1);
    });

    it("stores the name in NFC with whitespace runs collapsed", async () => {
      // "e" + combining acute, and a run of spaces (one a no-break space).
      const result = await create(`${prefix}  Cafe\u0301 \u00a0 Co`);

      const [cafe] = (await clock.listClients()).filter(
        (client) => client.id === result.value?.clientId,
      );
      expect(cafe.name).toBe(`${prefix} Caf\u00e9 Co`);
    });

    it("refuses a name that differs from another only in Unicode form", async () => {
      await create(`${prefix} Caf\u00e9`);

      const decomposed = await create(`${prefix} Cafe\u0301`);

      expect(decomposed.error).toBe("duplicate-name");
    });

    it("refuses line breaks, zero-width and bidi characters, creating nothing", async () => {
      const names = [
        `${prefix} Acme\r\nBcc: x`,
        `${prefix} Ac\u200bme`,
        `${prefix} \u202eemcA`,
        `${prefix} Acme\tCo`,
        // Hangul filler: renders blank.
        `${prefix} \u3164`,
        // Private use.
        `${prefix} Acme\ue000`,
      ];

      const results = [];
      for (const name of names) results.push(await create(name));

      expect(results.map((result) => result.error)).toEqual(
        names.map(() => "invalid-name"),
      );
      expect(await countNamed(`${prefix} Ac\u200bme`)).toBe(0);
    });

    it("accepts the joiners real names need: an emoji ZWJ sequence and Persian ZWNJ", async () => {
      // Family emoji (man ZWJ woman ZWJ girl); "Mi\u200cravad" style ZWNJ.
      const emoji = await create(
        `${prefix} \u{1f468}\u200d\u{1f469}\u200d\u{1f467} Co`,
      );
      const persian = await create(
        `${prefix} \u0645\u06cc\u200c\u0631\u0648\u0645`,
      );

      expect(emoji).toMatchObject({ error: null, status: 201 });
      expect(persian).toMatchObject({ error: null, status: 201 });
    });

    it("refuses an archived Client's name", async () => {
      await addClient("Gone", { archivedAt: NOW });

      const result = await create(`${prefix} gone`);

      expect(result.error).toBe("duplicate-name");
    });
  });

  describe("getTeam", () => {
    it("is null for an unknown id", async () => {
      expect(await clock.getTeam(randomUUID())).toBeNull();
    });

    it("is null for an id that isn't a UUID", async () => {
      expect(await clock.getTeam("not-a-uuid")).toBeNull();
    });

    it("lets a new Client invite its first Owner", async () => {
      const id = await addClient("Acme");

      const team = await clock.getTeam(id);

      expect(team).toEqual({
        clientId: id,
        name: `${prefix} Acme`,
        members: [],
        pendingInvitations: [],
        canInviteFirstOwner: true,
      });
    });

    it("lists the members, oldest first", async () => {
      const id = await addClient("Acme");
      await addMember(id, "-b@example.test", "member", new Date("2026-10-02"));
      await addMember(id, "-a@example.test", "owner", new Date("2026-10-01"));

      const team = await clock.getTeam(id);

      expect(team?.members).toEqual([
        {
          userId: expect.any(String),
          email: `${prefix}-a@example.test`,
          name: "-a@example.test",
          role: "owner",
        },
        {
          userId: expect.any(String),
          email: `${prefix}-b@example.test`,
          name: "-b@example.test",
          role: "member",
        },
      ]);
      expect(team?.canInviteFirstOwner).toBe(false);
    });

    it("lists only live pending invitations, newest first", async () => {
      const id = await addClient("Acme");
      const live = new Date(NOW.getTime() + DAY_MS);
      const older = await addInvitation(id, {
        expiresAt: live,
        createdAt: new Date("2026-10-10"),
        email: "older@example.test",
      });
      const newer = await addInvitation(id, {
        expiresAt: live,
        createdAt: new Date("2026-10-11"),
        email: "newer@example.test",
      });
      await addInvitation(id, { expiresAt: new Date(NOW.getTime() - 1) });
      await addInvitation(id, { expiresAt: live, status: "canceled" });

      const team = await clock.getTeam(id);

      expect(team?.pendingInvitations).toEqual([
        {
          id: newer,
          email: "newer@example.test",
          sentAt: new Date("2026-10-11"),
        },
        {
          id: older,
          email: "older@example.test",
          sentAt: new Date("2026-10-10"),
        },
      ]);
      expect(team?.canInviteFirstOwner).toBe(false);
    });

    it("lets the Client invite again once its invitation expires", async () => {
      const id = await addClient("Acme");
      await addInvitation(id, { expiresAt: new Date(NOW.getTime() + DAY_MS) });
      now = new Date(NOW.getTime() + 2 * DAY_MS);

      const team = await clock.getTeam(id);

      expect(team).toMatchObject({
        pendingInvitations: [],
        canInviteFirstOwner: true,
      });
    });
  });

  describe("inviteFirstOwner", () => {
    const SEVEN_DAYS_MS = 7 * DAY_MS;
    const RACE_HOLD_MS = 300;

    function waitMs(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // The inviter: the Admin's user row, as a passkey sign-in leaves it.
    async function addAdmin(): Promise<string> {
      const [row] = await db.withSystem((tx) =>
        tx
          .insert(user)
          .values({ name: env.ADMIN_EMAIL, email: env.ADMIN_EMAIL })
          .returning({ id: user.id }),
      );
      return row.id;
    }

    async function getInvitationRows(organizationId: string) {
      return db.withSystem((tx) =>
        tx
          .select()
          .from(invitation)
          .where(eq(invitation.organizationId, organizationId)),
      );
    }

    it("saves a plugin-shaped Owner invitation and emails the exact copy", async () => {
      const adminId = await addAdmin();
      const id = await addClient("Acme & <Co>");

      const result = await clock.inviteFirstOwner(id, "  Maya@Example.TEST ");

      const rows = await getInvitationRows(id);
      expect(rows).toEqual([
        {
          id: expect.stringMatching(UUID_V7),
          organizationId: id,
          email: "maya@example.test",
          role: "owner",
          status: "pending",
          expiresAt: new Date(NOW.getTime() + SEVEN_DAYS_MS),
          createdAt: NOW,
          inviterId: adminId,
        },
      ]);
      expect(result).toEqual({
        value: {
          id: rows[0].id,
          email: "maya@example.test",
          sentAt: NOW,
        },
        error: null,
        status: 201,
      });
      const url = `${baseUrl}/invitations/${rows[0].id}`;
      expect(mailer.sent).toEqual([
        {
          to: "maya@example.test",
          subject: `You're invited to ${prefix} Acme & <Co> on the Neves Labs portal`,
          text: `Neves Labs invited you to join ${prefix} Acme & <Co> on the Neves Labs client portal as its Owner. Accept the invitation: ${url}. It expires in 7 days.`,
          html: `<p>Neves Labs invited you to join ${prefix} Acme &amp; &lt;Co&gt; on the Neves Labs client portal as its Owner. Accept the invitation: <a href="${url}">${url}</a>. It expires in 7 days.</p>`,
        },
      ]);
    });

    it("stores the email in NFC", async () => {
      await addAdmin();
      const id = await addClient("Acme");

      const result = await clock.inviteFirstOwner(id, "josé@example.test");

      expect(result.value?.email).toBe("josé@example.test");
    });

    it.each([
      ["a blank", "  "],
      ["a non-", "not-an-email"],
      ["a CR/LF-injected", "maya@example.test\r\nBcc: eve@example.test"],
      ["a trailing-newline", "maya@example.test\n"],
      ["a zero-width", "ma​ya@example.test"],
      ["a bidi-control", "maya‮@example.test"],
      ["a two-recipient", "maya@example.test, eve@example.test"],
      ["a display-name", "Maya <maya@example.test>"],
      ["a 255-character", `${"a".repeat(242)}@example.test`],
    ])(
      "refuses %s email as invalid-email, saving and sending nothing",
      async (_label, email) => {
        await addAdmin();
        const id = await addClient("Acme");

        const result = await clock.inviteFirstOwner(id, email);

        expect(result).toEqual({
          value: null,
          error: "invalid-email",
          status: 422,
        });
        expect(await getInvitationRows(id)).toEqual([]);
        expect(mailer.sent).toEqual([]);
      },
    );

    it("checks the email before the Client", async () => {
      const result = await clock.inviteFirstOwner(randomUUID(), "nope");

      expect(result.error).toBe("invalid-email");
    });

    it("refuses an unknown or malformed Client as client-not-found", async () => {
      await addAdmin();

      const unknown = await clock.inviteFirstOwner(
        randomUUID(),
        "maya@example.test",
      );
      const malformed = await clock.inviteFirstOwner(
        "not-a-uuid",
        "maya@example.test",
      );

      expect(unknown).toEqual({
        value: null,
        error: "client-not-found",
        status: 404,
      });
      expect(malformed.error).toBe("client-not-found");
    });

    it("refuses ADMIN_EMAIL in any letter case as admin-email", async () => {
      await addAdmin();
      const id = await addClient("Acme");

      const result = await clock.inviteFirstOwner(
        id,
        ` ${env.ADMIN_EMAIL.toUpperCase()} `,
      );

      expect(result).toEqual({
        value: null,
        error: "admin-email",
        status: 422,
      });
      expect(await getInvitationRows(id)).toEqual([]);
    });

    it("checks the Client before ADMIN_EMAIL", async () => {
      const result = await clock.inviteFirstOwner(
        randomUUID(),
        env.ADMIN_EMAIL,
      );

      expect(result.error).toBe("client-not-found");
    });

    it("refuses a member of another Client, archived included, as other-client", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      const archived = await addClient("Gone", { archivedAt: NOW });
      await addMember(archived, "-maya@example.test", "member");

      const result = await clock.inviteFirstOwner(
        id,
        `${prefix}-MAYA@example.test`,
      );

      expect(result).toEqual({
        value: null,
        error: "other-client",
        status: 409,
      });
    });

    it("checks ADMIN_EMAIL before other Clients", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      const other = await addClient("Other");
      const adminId = await db.withSystem(async (tx) => {
        const [row] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, env.ADMIN_EMAIL));
        return row.id;
      });
      await db.withSystem((tx) =>
        tx.insert(member).values({
          organizationId: other,
          userId: adminId,
          role: "member",
          createdAt: NOW,
        }),
      );

      const result = await clock.inviteFirstOwner(id, env.ADMIN_EMAIL);

      expect(result.error).toBe("admin-email");
    });

    it("refuses a Client that has any member as not-first-owner", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      await addMember(id, "-someone@example.test", "member");

      const result = await clock.inviteFirstOwner(id, "maya@example.test");

      expect(result).toEqual({
        value: null,
        error: "not-first-owner",
        status: 409,
      });
    });

    it("checks other Clients before this Client's members", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      const other = await addClient("Other");
      await addMember(id, "-someone@example.test", "member");
      await addMember(other, "-maya@example.test", "member");

      const result = await clock.inviteFirstOwner(
        id,
        `${prefix}-maya@example.test`,
      );

      expect(result.error).toBe("other-client");
    });

    it("refuses a second invitation while one is live as pending-exists", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      await clock.inviteFirstOwner(id, "maya@example.test");

      const result = await clock.inviteFirstOwner(id, "leo@example.test");

      expect(result).toEqual({
        value: null,
        error: "pending-exists",
        status: 409,
      });
      expect(await getInvitationRows(id)).toHaveLength(1);
    });

    it("checks members before a live invitation", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      await clock.inviteFirstOwner(id, "maya@example.test");
      await addMember(id, "-someone@example.test", "member");

      const result = await clock.inviteFirstOwner(id, "leo@example.test");

      expect(result.error).toBe("not-first-owner");
    });

    it("saves one invitation when two invites race", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      // Two pooled connections, so both invites start at once.
      await Promise.all(
        [1, 2].map(() => db.withSystem((tx) => tx.execute(sql`select 1`))),
      );
      // Locking the organization row stalls each invite's insert (its
      // foreign-key check) until the commit. Without a lock of their own,
      // both would pass the checks first and both insert.
      const holder = new pg.Client({
        connectionString: getMigrateEnv().DATABASE_URL_OWNER,
      });
      await holder.connect();
      let results: Awaited<ReturnType<Auth["inviteFirstOwner"]>>[];
      try {
        await holder.query("begin");
        await holder.query(
          "select 1 from organization where id = $1 for update",
          [id],
        );
        const racing = Promise.all([
          clock.inviteFirstOwner(id, "maya@example.test"),
          clock.inviteFirstOwner(id, "leo@example.test"),
        ]);
        await Promise.race([racing, waitMs(RACE_HOLD_MS)]);
        await holder.query("commit");
        results = await racing;
      } finally {
        await holder.end();
      }

      expect(results.map((result) => result.error).sort()).toEqual([
        null,
        "pending-exists",
      ]);
      expect(await getInvitationRows(id)).toHaveLength(1);
      expect(mailer.sent).toHaveLength(1);
    });

    it("frees the slot once the invitation expires, and drops it from the lists", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      await clock.inviteFirstOwner(id, "maya@example.test");
      now = new Date(NOW.getTime() + SEVEN_DAYS_MS);

      const team = await clock.getTeam(id);
      const [acme] = await listMine();
      const again = await clock.inviteFirstOwner(id, "leo@example.test");

      expect(team).toMatchObject({
        pendingInvitations: [],
        canInviteFirstOwner: true,
      });
      expect(acme.owner).toBeNull();
      expect(again.error).toBeNull();
    });

    it("lists the new invitation as pending on the Team and Home", async () => {
      await addAdmin();
      const id = await addClient("Acme");

      const result = await clock.inviteFirstOwner(id, "maya@example.test");

      const team = await clock.getTeam(id);
      const [acme] = await listMine();
      expect(team?.pendingInvitations).toEqual([result.value]);
      expect(team?.canInviteFirstOwner).toBe(false);
      expect(acme.owner).toEqual({ pending: true });
    });

    it("keeps the invitation and succeeds when the email fails, logging no address or link", async () => {
      await addAdmin();
      const id = await addClient("Acme");
      mailer.failWith = Object.assign(
        new Error("550 maya@example.test rejected"),
        { code: "EENVELOPE" },
      );
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await clock.inviteFirstOwner(id, "maya@example.test");

      const rows = await getInvitationRows(id);
      expect(result.status).toBe(201);
      expect(rows).toHaveLength(1);
      expect(errorLog).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(errorLog.mock.calls[0]);
      expect(logged).toContain("EENVELOPE");
      expect(logged).not.toContain("maya");
      expect(logged).not.toContain(rows[0].id);
    });
  });

  describe("resendInvitation", () => {
    const SEVEN_DAYS_MS = 7 * DAY_MS;

    async function inviteMaya(): Promise<{ clientId: string; id: string }> {
      await db.withSystem((tx) =>
        tx
          .insert(user)
          .values({ name: env.ADMIN_EMAIL, email: env.ADMIN_EMAIL }),
      );
      const clientId = await addClient("Acme");
      const result = await clock.inviteFirstOwner(
        clientId,
        "maya@example.test",
      );
      if (result.value === null) throw new Error("invite failed");
      return { clientId, id: result.value.id };
    }

    async function getExpiresAt(id: string): Promise<Date> {
      const [row] = await db.withSystem((tx) =>
        tx
          .select({ expiresAt: invitation.expiresAt })
          .from(invitation)
          .where(eq(invitation.id, id)),
      );
      return row.expiresAt;
    }

    it("resets the expiry to now + 7 days and sends the same email again", async () => {
      const { clientId, id } = await inviteMaya();
      now = new Date(NOW.getTime() + 3 * DAY_MS);

      const result = await clock.resendInvitation(clientId, id);

      expect(result).toEqual({
        value: { id, email: "maya@example.test", sentAt: NOW },
        error: null,
        status: 200,
      });
      expect(await getExpiresAt(id)).toEqual(
        new Date(now.getTime() + SEVEN_DAYS_MS),
      );
      expect(mailer.sent).toHaveLength(2);
      expect(mailer.sent[1]).toEqual(mailer.sent[0]);
      expect(mailer.sent[1].text).toContain(`${baseUrl}/invitations/${id}.`);
    });

    it("keeps the new expiry and succeeds when the email fails", async () => {
      const { clientId, id } = await inviteMaya();
      now = new Date(NOW.getTime() + DAY_MS);
      mailer.failWith = new Error("down");
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await clock.resendInvitation(clientId, id);

      expect(result.status).toBe(200);
      expect(await getExpiresAt(id)).toEqual(
        new Date(now.getTime() + SEVEN_DAYS_MS),
      );
    });

    it("refuses an expired, canceled, unknown or malformed invitation as not-found", async () => {
      const { clientId, id } = await inviteMaya();
      const other = await addClient("Other");
      const leo = await clock.inviteFirstOwner(other, "leo@example.test");
      if (leo.value === null) throw new Error("invite failed");
      await clock.revokeInvitation(other, leo.value.id);
      mailer.sent.length = 0;
      now = new Date(NOW.getTime() + SEVEN_DAYS_MS);

      const results = await Promise.all(
        [
          [clientId, id],
          [other, leo.value.id],
          [clientId, randomUUID()],
          [clientId, "nope"],
          ["nope", id],
        ].map(([client, target]) => clock.resendInvitation(client, target)),
      );

      for (const result of results) {
        expect(result).toEqual({
          value: null,
          error: "not-found",
          status: 404,
        });
      }
      expect(mailer.sent).toEqual([]);
      expect(await getExpiresAt(id)).toEqual(
        new Date(NOW.getTime() + SEVEN_DAYS_MS),
      );
    });

    it("refuses another Client's invitation, or one that isn't an Owner's, as not-found", async () => {
      const { id } = await inviteMaya();
      const other = await addClient("Other");
      const memberInvite = await addInvitation(other, {
        expiresAt: new Date(NOW.getTime() + DAY_MS),
      });
      await db.withSystem((tx) =>
        tx
          .update(invitation)
          .set({ role: "member" })
          .where(eq(invitation.id, memberInvite)),
      );
      mailer.sent.length = 0;

      const crossClient = await clock.resendInvitation(other, id);
      const notOwner = await clock.resendInvitation(other, memberInvite);
      const crossRevoke = await clock.revokeInvitation(other, id);

      expect(crossClient.error).toBe("not-found");
      expect(notOwner.error).toBe("not-found");
      expect(crossRevoke.error).toBe("not-found");
      expect(mailer.sent).toEqual([]);
      expect(await getExpiresAt(id)).toEqual(
        new Date(NOW.getTime() + SEVEN_DAYS_MS),
      );
    });

    it("caps invites and resends to one address at 5 emails an hour", async () => {
      const { clientId, id } = await inviteMaya();
      const outcomes: (string | null)[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = await clock.resendInvitation(clientId, id);
        outcomes.push(result.error);
      }

      expect(outcomes).toEqual([null, null, null, null, "too-many-emails"]);
      expect(mailer.sent).toHaveLength(5);
      const refused = await clock.resendInvitation(clientId, id);
      expect(refused).toEqual({
        value: null,
        error: "too-many-emails",
        status: 429,
      });
    });

    it("counts an invite → revoke → invite loop against the same cap", async () => {
      const { clientId, id } = await inviteMaya();
      let current = id;
      const errors: (string | null)[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await clock.revokeInvitation(clientId, current);
        const result = await clock.inviteFirstOwner(
          clientId,
          "MAYA@example.test",
        );
        errors.push(result.error);
        if (result.value) current = result.value.id;
      }

      expect(errors).toEqual([null, null, null, null, "too-many-emails"]);
      expect(mailer.sent).toHaveLength(5);
      expect(await clock.getTeam(clientId)).toMatchObject({
        pendingInvitations: [],
      });
    });

    it("caps all invitation email at 20 an hour, whatever the addresses, leaving magic links alone", async () => {
      const { clientId, id } = await inviteMaya();
      let current = id;
      const errors: (string | null)[] = [];
      // Maya's invite was the 1st send; these are the 2nd to the 21st.
      for (let send = 2; send <= 21; send += 1) {
        await clock.revokeInvitation(clientId, current);
        const result = await clock.inviteFirstOwner(
          clientId,
          `person${send}@example.test`,
        );
        errors.push(result.error);
        if (result.value) current = result.value.id;
      }

      expect(errors.slice(0, 19)).toEqual(Array(19).fill(null));
      expect(errors[19]).toBe("too-many-invitations");
      expect(mailer.sent).toHaveLength(20);
      // A live invitation to an address with no sends yet.
      const fresh = await addInvitation(clientId, {
        expiresAt: new Date(NOW.getTime() + DAY_MS),
      });
      const resend = await clock.resendInvitation(clientId, fresh);
      expect(resend).toEqual({
        value: null,
        error: "too-many-invitations",
        status: 429,
      });

      await requestMagicLink(env.ADMIN_EMAIL, createIp());

      expect(mailer.sent).toHaveLength(21);
      expect(mailer.sent[20].subject).toBe(
        "Your Neves Labs portal sign-in link",
      );
    });

    it("doesn't count a per-address refusal against the global cap", async () => {
      const { clientId, id } = await inviteMaya();
      for (let resend = 0; resend < 4; resend += 1) {
        await clock.resendInvitation(clientId, id);
      }
      // Ten refusals at Maya's cap: none may reach `invitation:*`.
      for (let refused = 0; refused < 10; refused += 1) {
        const result = await clock.resendInvitation(clientId, id);
        expect(result.error).toBe("too-many-emails");
      }

      // 5 sent so far, so 15 more fit under the 20 an hour.
      let current = id;
      const errors: (string | null)[] = [];
      for (let send = 0; send < 15; send += 1) {
        await clock.revokeInvitation(clientId, current);
        const result = await clock.inviteFirstOwner(
          clientId,
          `other${send}@example.test`,
        );
        errors.push(result.error);
        if (result.value) current = result.value.id;
      }

      expect(errors).toEqual(Array(15).fill(null));
      expect(mailer.sent).toHaveLength(20);
    });

    it("frees the cap after an hour", async () => {
      const { clientId, id } = await inviteMaya();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await clock.resendInvitation(clientId, id);
      }
      now = new Date(NOW.getTime() + 60 * MINUTE_MS);

      const result = await clock.resendInvitation(clientId, id);

      expect(result.error).toBeNull();
    });
  });

  describe("revokeInvitation", () => {
    const SEVEN_DAYS_MS = 7 * DAY_MS;

    async function inviteMaya(): Promise<{ clientId: string; id: string }> {
      await db.withSystem((tx) =>
        tx
          .insert(user)
          .values({ name: env.ADMIN_EMAIL, email: env.ADMIN_EMAIL }),
      );
      const clientId = await addClient("Acme");
      const result = await clock.inviteFirstOwner(
        clientId,
        "maya@example.test",
      );
      if (result.value === null) throw new Error("invite failed");
      return { clientId, id: result.value.id };
    }

    it("cancels the invitation, which drops off the Team and frees the slot", async () => {
      const { clientId, id } = await inviteMaya();

      const result = await clock.revokeInvitation(clientId, id);

      const [row] = await db.withSystem((tx) =>
        tx
          .select({ status: invitation.status })
          .from(invitation)
          .where(eq(invitation.id, id)),
      );
      expect(result).toEqual({ value: null, error: null, status: 200 });
      expect(row.status).toBe("canceled");
      expect(await clock.getTeam(clientId)).toMatchObject({
        pendingInvitations: [],
        canInviteFirstOwner: true,
      });
    });

    it("refuses an already canceled, expired, unknown or malformed invitation as not-found", async () => {
      const { clientId, id } = await inviteMaya();
      await clock.revokeInvitation(clientId, id);
      const other = await addClient("Other");
      const leo = await clock.inviteFirstOwner(other, "leo@example.test");
      if (leo.value === null) throw new Error("invite failed");
      now = new Date(NOW.getTime() + SEVEN_DAYS_MS);

      const results = await Promise.all(
        [
          [clientId, id],
          [other, leo.value.id],
          [clientId, randomUUID()],
          [clientId, "nope"],
        ].map(([client, target]) => clock.revokeInvitation(client, target)),
      );

      for (const result of results) {
        expect(result).toEqual({
          value: null,
          error: "not-found",
          status: 404,
        });
      }
    });
  });

  describe("invite eligibility (shared with beforeCreateInvitation)", () => {
    const GENERIC_REFUSAL = {
      body: { message: "This email can't be invited." },
    };
    const hook = createInvitationEligibilityHook(db, env.ADMIN_EMAIL);

    function inviteVia(organizationId: string, email: string): Promise<void> {
      return hook({ invitation: { organizationId, email } });
    }

    it("refuses ADMIN_EMAIL in any letter case", async () => {
      const id = await addClient("Acme");

      const refusal = inviteVia(id, env.ADMIN_EMAIL.toUpperCase());

      await expect(refusal).rejects.toBeInstanceOf(APIError);
      await expect(refusal).rejects.toMatchObject(GENERIC_REFUSAL);
    });

    it("refuses a member of another Client with the same generic message", async () => {
      const id = await addClient("Acme");
      const other = await addClient("Other");
      await addMember(other, "-maya@example.test", "owner");

      await expect(
        inviteVia(id, `${prefix}-maya@example.test`),
      ).rejects.toMatchObject(GENERIC_REFUSAL);
    });

    it("refuses an email with a line break", async () => {
      const id = await addClient("Acme");

      await expect(
        inviteVia(id, "maya@example.test\r\nBcc: eve@example.test"),
      ).rejects.toMatchObject(GENERIC_REFUSAL);
    });

    it("lets anyone else through, a member of this Client included", async () => {
      const id = await addClient("Acme");
      await addMember(id, "-maya@example.test", "member");

      await expect(
        inviteVia(id, `${prefix}-maya@example.test`),
      ).resolves.toBeUndefined();
      await expect(inviteVia(id, "leo@example.test")).resolves.toBeUndefined();
    });

    // Through Better Auth's own invite endpoint, as a Phase 3 Owner would
    // call it: proves the hook is registered, not just that it works.
    it("runs on Better Auth's native invite-member", async () => {
      const ip = createIp();
      const cookie = await signInWithMagicLink(ip);
      const id = await addClient("Acme");
      const other = await addClient("Other");
      await addMember(other, "-maya@example.test", "owner");
      const [admin] = await db.withSystem((tx) =>
        tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, env.ADMIN_EMAIL)),
      );
      await db.withSystem((tx) =>
        tx.insert(member).values({
          organizationId: id,
          userId: admin.id,
          role: "owner",
          createdAt: NOW,
        }),
      );
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const refused = await auth.handler(
        apiRequest("/organization/invite-member", cookie, ip, {
          email: `${prefix}-maya@example.test`,
          role: "member",
          organizationId: id,
        }),
      );
      const allowed = await auth.handler(
        apiRequest("/organization/invite-member", cookie, ip, {
          email: "leo@example.test",
          role: "member",
          organizationId: id,
        }),
      );

      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject(GENERIC_REFUSAL.body);
      expect(allowed.status).toBe(200);
      const emails = (
        await db.withSystem((tx) =>
          tx
            .select({ email: invitation.email })
            .from(invitation)
            .where(eq(invitation.organizationId, id)),
        )
      ).map((row) => row.email);
      expect(emails).toEqual(["leo@example.test"]);
    });
  });
});
