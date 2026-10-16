import { describe, expect, it } from "vitest";
import {
  getSyncProblemReason,
  isMapDrawerClose,
  isMapDrawerToggle,
} from "@/lib/projects";

function urls(current: string, next: string) {
  return {
    currentUrl: new URL(current, "http://localhost"),
    nextUrl: new URL(next, "http://localhost"),
  };
}

describe("isMapDrawerToggle", () => {
  it("is true when only the map param opens, closes or changes", () => {
    expect(isMapDrawerToggle(urls("/p", "/p?map=a"))).toBe(true);
    expect(isMapDrawerToggle(urls("/p?map=a", "/p"))).toBe(true);
    expect(isMapDrawerToggle(urls("/p?map=a", "/p?map=b"))).toBe(true);
  });

  it("is false for the same URL, another path or another param", () => {
    expect(isMapDrawerToggle(urls("/p?map=a", "/p?map=a"))).toBe(false);
    expect(isMapDrawerToggle(urls("/p", "/q?map=a"))).toBe(false);
    expect(isMapDrawerToggle(urls("/p?x=1", "/p?x=2&map=a"))).toBe(false);
  });
});

describe("isMapDrawerClose", () => {
  it("is true only when the map param is dropped", () => {
    expect(isMapDrawerClose(urls("/p?map=a", "/p"))).toBe(true);
  });

  it("is false when the drawer opens or switches Project", () => {
    expect(isMapDrawerClose(urls("/p", "/p?map=a"))).toBe(false);
    expect(isMapDrawerClose(urls("/p?map=a", "/p?map=b"))).toBe(false);
  });
});

describe("getSyncProblemReason", () => {
  const NOW = new Date("2026-10-16T12:00:00Z");
  const HEALTHY = {
    unlinkedAt: null,
    lastSyncError: null,
    lastSyncedAt: new Date("2026-10-16T11:00:00Z"),
    clientArchived: false,
  };

  it("is null for a healthy board, even one carrying warnings", () => {
    const withWarnings = {
      ...HEALTHY,
      syncWarnings: [{ kind: "missing-field", field: "Client note" }],
    };

    expect(getSyncProblemReason(withWarnings, NOW)).toBeNull();
  });

  it("names a recorded error before staleness", () => {
    const both = {
      ...HEALTHY,
      lastSyncError: "rate limit",
      lastSyncedAt: new Date("2026-10-10T00:00:00Z"),
    };

    expect(getSyncProblemReason(both, NOW)).toBe("error");
  });

  it("names staleness, including a board that never synced", () => {
    const never = { ...HEALTHY, lastSyncedAt: null };

    expect(getSyncProblemReason(never, NOW)).toBe("stale");
  });
});
