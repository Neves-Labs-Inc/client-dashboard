import { describe, expect, it, vi } from "vitest";
import routes from "@/routes";
import vercelConfig from "../../vercel.json";
import { loader as webhookLoader } from "@/routes/webhooks.github";
import { action as reconcileAction } from "@/routes/jobs.reconcile";

vi.mock("@/lib/board-sync/board-sync.server", () => ({ boardSync: {} }));

describe("board sync routes", () => {
  it("registers the GitHub webhook and the reconcile job", () => {
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: "webhooks/github",
        file: "routes/webhooks.github.ts",
      }),
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: "jobs/reconcile",
        file: "routes/jobs.reconcile.ts",
      }),
    );
  });

  it("schedules the reconcile job every 15 minutes on Vercel Cron", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/jobs/reconcile",
      schedule: "*/15 * * * *",
    });
  });

  it("answers a GET on the webhook with 405, allowing POST", () => {
    const response = webhookLoader();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers a POST on the reconcile job with 405, allowing GET", () => {
    const response = reconcileAction();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});
