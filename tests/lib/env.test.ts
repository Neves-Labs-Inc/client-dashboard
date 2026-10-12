import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

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
});
