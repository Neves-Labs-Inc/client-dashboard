import { describe, expect, it } from "vitest";
import { isSyncProblem } from "@/lib/board-sync/sync-problem";

const NOW = new Date("2026-10-16T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const HEALTHY = {
  unlinkedAt: null,
  lastSyncError: null,
  lastSyncedAt: new Date(NOW.getTime() - HOUR_MS),
  clientArchived: false,
};

describe("isSyncProblem", () => {
  it("is false for a freshly synced board", () => {
    expect(isSyncProblem(HEALTHY, NOW)).toBe(false);
  });

  it("is true when the last sync failed", () => {
    expect(
      isSyncProblem({ ...HEALTHY, lastSyncError: "rate limit" }, NOW),
    ).toBe(true);
  });

  it("is false at exactly 26 hours and true one second later", () => {
    const atLimit = new Date(NOW.getTime() - 26 * HOUR_MS);
    const pastLimit = new Date(NOW.getTime() - 26 * HOUR_MS - 1000);

    expect(isSyncProblem({ ...HEALTHY, lastSyncedAt: atLimit }, NOW)).toBe(
      false,
    );
    expect(isSyncProblem({ ...HEALTHY, lastSyncedAt: pastLimit }, NOW)).toBe(
      true,
    );
  });

  it("is true for a board that has never synced", () => {
    expect(isSyncProblem({ ...HEALTHY, lastSyncedAt: null }, NOW)).toBe(true);
  });

  it("is false for an unlinked board, even with an error", () => {
    const unlinked = {
      ...HEALTHY,
      unlinkedAt: new Date("2026-10-01"),
      lastSyncError: "rate limit",
      lastSyncedAt: null,
    };

    expect(isSyncProblem(unlinked, NOW)).toBe(false);
  });

  it("is false for an archived Client's stale board", () => {
    const archived = {
      ...HEALTHY,
      clientArchived: true,
      lastSyncedAt: new Date(NOW.getTime() - 48 * HOUR_MS),
    };

    expect(isSyncProblem(archived, NOW)).toBe(false);
  });

  it("ignores sync warnings on a healthy board", () => {
    const withWarnings = {
      ...HEALTHY,
      syncWarnings: [{ kind: "missing-field", field: "Client note" }],
    };

    expect(isSyncProblem(withWarnings, NOW)).toBe(false);
  });
});
