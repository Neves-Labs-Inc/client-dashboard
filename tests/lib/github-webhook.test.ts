import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardSync } from "@/lib/board-sync/board-sync";
import { createGithubWebhookHandler } from "@/lib/github-webhook";
import { createStubBoardSync } from "../support/board-sync";

const SECRET = "test-webhook-secret";
const WEBHOOK_URL = "http://localhost:5173/webhooks/github";
const BOARD_NODE_ID = "PVT_kwDOBoard";
const ISSUE_NODE_ID = "I_kwDOIssue";
const REPOSITORY_NODE_ID = "R_kgDORepo";
const MAX_BODY_BYTES = 1024 * 1024;
const OVER_LIMIT_BYTES = MAX_BODY_BYTES + 1;

type SyncCall = [method: string, ...args: string[]];

// A board-sync that records every trigger it's asked to run.
function createFakeBoardSync(): { boardSync: BoardSync; calls: SyncCall[] } {
  const calls: SyncCall[] = [];
  const boardSync = createStubBoardSync({
    refreshPool: async () => {
      calls.push(["refreshPool"]);
    },
    syncBoardByNodeId: async (nodeId) => {
      calls.push(["syncBoardByNodeId", nodeId]);
    },
    syncBoardsWithIssue: async (nodeId) => {
      calls.push(["syncBoardsWithIssue", nodeId]);
    },
    syncBoardsWithRepository: async (nodeId) => {
      calls.push(["syncBoardsWithRepository", nodeId]);
    },
  });
  return { boardSync, calls };
}

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function delivery(
  event: string,
  payload: unknown,
  signature: string | null = sign(JSON.stringify(payload)),
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    "x-github-event": event,
  });
  if (signature !== null) headers.set("x-hub-signature-256", signature);
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GitHub webhook handler", () => {
  it.each<[string, unknown, SyncCall[]]>([
    [
      "projects_v2",
      { action: "edited", projects_v2: { node_id: BOARD_NODE_ID } },
      [["refreshPool"], ["syncBoardByNodeId", BOARD_NODE_ID]],
    ],
    [
      "projects_v2_item",
      {
        action: "edited",
        projects_v2_item: { project_node_id: BOARD_NODE_ID },
      },
      [["syncBoardByNodeId", BOARD_NODE_ID]],
    ],
    [
      "projects_v2_status_update",
      {
        action: "created",
        projects_v2_status_update: { project_node_id: BOARD_NODE_ID },
      },
      [["syncBoardByNodeId", BOARD_NODE_ID]],
    ],
    [
      "issues",
      { action: "closed", issue: { node_id: ISSUE_NODE_ID } },
      [["syncBoardsWithIssue", ISSUE_NODE_ID]],
    ],
    [
      "milestone",
      {
        action: "edited",
        milestone: { id: 1 },
        repository: { node_id: REPOSITORY_NODE_ID },
      },
      [["syncBoardsWithRepository", REPOSITORY_NODE_ID]],
    ],
  ])(
    "syncs on a signed %s delivery, then answers 204",
    async (event, payload, expected) => {
      const { boardSync, calls } = createFakeBoardSync();
      const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

      const response = await handle(delivery(event, payload));

      expect(response.status).toBe(204);
      expect(calls).toEqual(expected);
    },
  );

  it("refreshes the pool before syncing a deleted board", async () => {
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

    const response = await handle(
      delivery("projects_v2", {
        action: "deleted",
        projects_v2: { node_id: BOARD_NODE_ID },
      }),
    );

    expect(response.status).toBe(204);
    expect(calls).toEqual([
      ["refreshPool"],
      ["syncBoardByNodeId", BOARD_NODE_ID],
    ]);
  });

  it.each([
    ["ping", { zen: "Keep it logically awesome." }],
    ["star", { action: "created" }],
  ])(
    "answers a signed %s delivery with 204 and no sync",
    async (event, payload) => {
      const { boardSync, calls } = createFakeBoardSync();
      const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

      const response = await handle(delivery(event, payload));

      expect(response.status).toBe(204);
      expect(calls).toEqual([]);
    },
  );

  const issuePayload = { action: "closed", issue: { node_id: ISSUE_NODE_ID } };
  const goodSignature = sign(JSON.stringify(issuePayload));

  it.each([
    ["missing", null],
    ["signed with another secret", sign(JSON.stringify(issuePayload), "nope")],
    ["the wrong length", `${goodSignature}00`],
    ["without the sha256= prefix", goodSignature.slice("sha256=".length)],
    ["not hex", `sha256=${"z".repeat(64)}`],
  ])(
    "refuses a delivery whose signature is %s with 401 and no sync",
    async (_label, signature) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { boardSync, calls } = createFakeBoardSync();
      const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

      const response = await handle(
        delivery("issues", issuePayload, signature),
      );

      expect(response.status).toBe(401);
      expect(calls).toEqual([]);
    },
  );

  it("refuses a body changed after signing with 401", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const tampered = { action: "closed", issue: { node_id: "I_kwDOOther" } };

    const response = await handle(delivery("issues", tampered, goodSignature));

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("logs a refused delivery by its event name only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

    await handle(delivery("issues", issuePayload, sign("other body")));

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("issues");
    expect(logged).not.toContain(ISSUE_NODE_ID);
    expect(logged).not.toContain(SECRET);
  });

  it.each<[string, unknown]>([
    ["projects_v2", { action: "edited", projects_v2: {} }],
    ["projects_v2_item", { action: "edited" }],
    [
      "projects_v2_status_update",
      { projects_v2_status_update: { project_node_id: 7 } },
    ],
    ["issues", { action: "closed", issue: { node_id: "" } }],
    ["milestone", { action: "edited", repository: null }],
  ])(
    "answers a signed %s delivery missing its node id with 400",
    async (event, payload) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { boardSync, calls } = createFakeBoardSync();
      const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

      const response = await handle(delivery(event, payload));

      expect(response.status).toBe(400);
      expect(calls).toEqual([]);
    },
  );

  it("answers a signed body that isn't JSON with 400", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const body = "not json";

    const response = await handle(
      new Request(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "x-github-event": "issues",
          "x-hub-signature-256": sign(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("logs a refused delivery's odd event name as unknown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const forgedEvent = "issues] INFO admin signed in [";

    const response = await handle(
      delivery(forgedEvent, issuePayload, sign("other body")),
    );

    expect(response.status).toBe(401);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("unknown");
    expect(logged).not.toContain("admin signed in");
  });

  it("logs a refused delivery's overlong event name as unknown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });

    await handle(delivery("a".repeat(65), issuePayload, null));

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("unknown");
    expect(logged).not.toContain("a".repeat(65));
  });

  it("refuses a declared body over 1 MB with 413, before verifying", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const request = delivery("issues", issuePayload);
    request.headers.set("content-length", String(OVER_LIMIT_BYTES));

    const response = await handle(request);

    expect(response.status).toBe(413);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("bad signature");
    expect(calls).toEqual([]);
  });

  it("refuses a body over 1 MB with 413 when no length is declared", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const body = JSON.stringify({
      issue: { node_id: ISSUE_NODE_ID },
      padding: "x".repeat(OVER_LIMIT_BYTES),
    });

    const response = await handle(
      new Request(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "x-github-event": "issues",
          "x-hub-signature-256": sign(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("refuses a streamed body over 1 MB with 413 despite a small declared length", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const chunk = new Uint8Array(64 * 1024).fill(0x78);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > OVER_LIMIT_BYTES) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });

    const response = await handle(
      new Request(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "x-github-event": "issues",
          "x-hub-signature-256": goodSignature,
          "content-length": "10",
        },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("accepts a signed body just under 1 MB", async () => {
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: SECRET, boardSync });
    const prefix = JSON.stringify({
      issue: { node_id: ISSUE_NODE_ID },
      padding: "",
    });
    const payload = {
      issue: { node_id: ISSUE_NODE_ID },
      padding: "x".repeat(MAX_BODY_BYTES - prefix.length),
    };

    const response = await handle(delivery("issues", payload));

    expect(response.status).toBe(204);
    expect(calls).toEqual([["syncBoardsWithIssue", ISSUE_NODE_ID]]);
  });

  it("answers 503 when GitHub is off", async () => {
    const { boardSync, calls } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({ secret: null, boardSync });

    const response = await handle(delivery("issues", issuePayload));

    expect(response.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("answers 500 when the board sync throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { boardSync } = createFakeBoardSync();
    const handle = createGithubWebhookHandler({
      secret: SECRET,
      boardSync: {
        ...boardSync,
        syncBoardsWithIssue: async () => {
          throw new Error("connection refused");
        },
      },
    });

    const response = await handle(delivery("issues", issuePayload));

    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalled();
  });
});
