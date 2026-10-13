import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/lib/db/db";
import { getAppEnv } from "@/lib/env";
import { getHealthResponse } from "@/lib/health";

const env = getAppEnv();
const openDbs: Db[] = [];

function openDb(overrides: { tenantUrl?: string; systemUrl?: string }): Db {
  const db = createDb({
    tenantUrl: env.DATABASE_URL_TENANT,
    systemUrl: env.DATABASE_URL_SYSTEM,
    queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
    ...overrides,
  });
  openDbs.push(db);
  return db;
}

function withPort(url: string, port: string): string {
  const parsed = new URL(url);
  parsed.port = port;
  return parsed.toString();
}

function withPassword(url: string, password: string): string {
  const parsed = new URL(url);
  parsed.password = password;
  return parsed.toString();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(openDbs.splice(0).map((db) => db.close()));
});

describe("getHealthResponse", () => {
  it("returns 200 {ok:true} uncached when both pools work", async () => {
    const response = await getHealthResponse(openDb({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 {ok:false} and logs the tenant pool when it is unreachable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = openDb({
      tenantUrl: withPort(env.DATABASE_URL_TENANT, "1"),
    });

    const response = await getHealthResponse(db);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const output = logged.mock.calls.flat().join("\n");
    expect(output).toMatch(/tenant pool failed: \S/);
    expect(output).not.toContain("system");
    expect(output).not.toContain("app_tenant_local");
  });

  it("returns 503 {ok:false} and logs the system pool when its password is wrong", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = openDb({
      systemUrl: withPassword(env.DATABASE_URL_SYSTEM, "wrong-password"),
    });

    const response = await getHealthResponse(db);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const output = logged.mock.calls.flat().join("\n");
    expect(output).toContain("system");
    expect(output).not.toContain("wrong-password");
  });

  it("logs a non-empty reason when connecting to localhost fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = openDb({
      tenantUrl: env.DATABASE_URL_TENANT.replace(/@[^:/]+:\d+/, "@localhost:1"),
    });

    await getHealthResponse(db);

    expect(logged.mock.calls.flat().join("\n")).toMatch(
      /tenant pool failed: \S/,
    );
  });

  it("returns 503 {ok:false} when a pool never answers", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const hangingDb: Db = {
      withTenant: () => new Promise(() => {}),
      withSystem: (work) => openDb({}).withSystem(work),
      betterAuthDb: openDb({}).betterAuthDb,
      close: async () => {},
    };

    const response = await getHealthResponse(hangingDb, 100);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(logged.mock.calls.flat().join("\n")).toMatch(
      /tenant pool failed: \S/,
    );
  });

  it("shares one check between concurrent requests", async () => {
    let tenantCalls = 0;
    const countingDb: Db = {
      withTenant: async () => {
        tenantCalls += 1;
        return undefined as never;
      },
      withSystem: async () => undefined as never,
      betterAuthDb: undefined as never,
      close: async () => {},
    };

    const responses = await Promise.all([
      getHealthResponse(countingDb),
      getHealthResponse(countingDb),
      getHealthResponse(countingDb),
    ]);

    expect(tenantCalls).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
  });
});
