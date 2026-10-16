import { describe, expect, it, vi } from "vitest";
import {
  getTaskIdAfterSave,
  getTriageBanner,
  runTriageClientAction,
  type TriageOutcome,
} from "@/lib/admin-requests";

const TASK_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abd0";

describe("the triage client action", () => {
  it("passes a save through, so every loader revalidates", async () => {
    const outcome = await runTriageClientAction(async () => ({
      kind: "saved",
    }));

    expect(outcome).toEqual({ kind: "saved" });
  });

  it("answers a refusal with a 4xx status", async () => {
    const outcome = await runTriageClientAction(async () => ({
      kind: "refused",
      error: "withdrawn",
    }));

    expect(outcome).toMatchObject({
      data: { kind: "refused", error: "withdrawn" },
      init: { status: 422 },
    });
  });

  it("answers a server failure with a 5xx status", async () => {
    const outcome = await runTriageClientAction(async () => ({
      kind: "failed",
    }));

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
  });

  it("turns a network failure into the generic save banner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = (await runTriageClientAction(async () => {
      throw new TypeError("Failed to fetch");
    })) as { data: TriageOutcome; init: ResponseInit };

    expect(outcome.init.status).toBe(503);
    expect(getTriageBanner(outcome.data)).toBe("Couldn't save. Try again.");
  });

  it("lets the guard's redirect through", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { location: "/sign-in" },
    });

    await expect(
      runTriageClientAction(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});

describe("the Task select after a save", () => {
  it("keeps the picked Task when the status keeps a link", () => {
    expect(getTaskIdAfterSave("ACCEPTED", TASK_ID)).toBe(TASK_ID);
    expect(getTaskIdAfterSave("DONE", TASK_ID)).toBe(TASK_ID);
  });

  it("drops it when the save cleared the link", () => {
    expect(getTaskIdAfterSave("DECLINED", TASK_ID)).toBe("");
    expect(getTaskIdAfterSave("NEW", TASK_ID)).toBe("");
  });
});
