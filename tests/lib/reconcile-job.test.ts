import { describe, expect, it, vi } from "vitest";
import type { BoardSync } from "@/lib/board-sync/board-sync";
import { createReconcileHandler } from "@/lib/reconcile-job";

const CRON_SECRET = "cron-secret-0123456789abcdef-0123456789";
const RECONCILE_URL = "http://localhost:5173/jobs/reconcile";

type ReconcileOutcome = Awaited<ReturnType<BoardSync["reconcile"]>>;

function createFakeBoardSync(outcome: ReconcileOutcome): {
  boardSync: BoardSync;
  reconcile: ReturnType<typeof vi.fn<BoardSync["reconcile"]>>;
} {
  const reconcile = vi.fn<BoardSync["reconcile"]>(async () => outcome);
  const boardSync: BoardSync = {
    refreshPool: async () => {},
    syncBoardByNodeId: async () => {},
    syncBoardsWithIssue: async () => {},
    syncBoardsWithRepository: async () => {},
    reconcile,
    syncProject: async () => ({ value: null, error: null, status: 200 }),
  };
  return { boardSync, reconcile };
}

function cronRequest(authorization: string | null): Request {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request(RECONCILE_URL, { headers });
}

describe("reconcile job handler", () => {
  it("runs the reconcile and answers 200 with its counts", async () => {
    const { boardSync, reconcile } = createFakeBoardSync({
      skipped: false,
      synced: 3,
      failed: 1,
    });
    const handle = createReconcileHandler({
      cronSecret: CRON_SECRET,
      githubEnabled: true,
      boardSync,
    });

    const response = await handle(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      skipped: false,
      synced: 3,
      failed: 1,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("reports a skipped reconcile (another one running)", async () => {
    const { boardSync } = createFakeBoardSync({
      skipped: true,
      synced: 0,
      failed: 0,
    });
    const handle = createReconcileHandler({
      cronSecret: CRON_SECRET,
      githubEnabled: true,
      boardSync,
    });

    const response = await handle(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      skipped: true,
      synced: 0,
      failed: 0,
    });
  });

  it.each([
    ["no Authorization header", null],
    ["a wrong secret", "Bearer cron-secret-0123456789abcdef-wrong-wrong"],
    ["a longer secret", `Bearer ${CRON_SECRET}x`],
    ["the bare secret", CRON_SECRET],
    ["another scheme", `Basic ${CRON_SECRET}`],
    ["a lowercase scheme", `bearer ${CRON_SECRET}`],
  ])("refuses %s with 401 and no reconcile", async (_label, authorization) => {
    const { boardSync, reconcile } = createFakeBoardSync({
      skipped: false,
      synced: 0,
      failed: 0,
    });
    const handle = createReconcileHandler({
      cronSecret: CRON_SECRET,
      githubEnabled: true,
      boardSync,
    });

    const response = await handle(cronRequest(authorization));

    expect(response.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it.each([
    ["GitHub is off", { cronSecret: CRON_SECRET, githubEnabled: false }],
    ["CRON_SECRET is unset", { cronSecret: null, githubEnabled: true }],
  ])("answers 503 when %s", async (_label, config) => {
    const { boardSync, reconcile } = createFakeBoardSync({
      skipped: false,
      synced: 0,
      failed: 0,
    });
    const handle = createReconcileHandler({ ...config, boardSync });

    const response = await handle(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(503);
    expect(reconcile).not.toHaveBeenCalled();
  });
});
