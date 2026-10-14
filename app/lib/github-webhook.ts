import { createHmac, timingSafeEqual } from "node:crypto";
import type { BoardSync } from "@/lib/board-sync/board-sync";
import { describeError } from "@/lib/describe-error";

// POST /webhooks/github: the GitHub App's signed deliveries. No session, no
// cookies, no same-origin check (GitHub isn't a browser); the signature is
// the only authentication.

const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const PAYLOAD_TOO_LARGE = 413;
const INTERNAL_SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

const EVENT_HEADER = "x-github-event";
const SIGNATURE_HEADER = "x-hub-signature-256";
const SIGNATURE_PREFIX = "sha256=";
const SHA256_HEX = /^[0-9a-f]{64}$/;
// GitHub's event names. Anything else is logged and routed as "unknown", so
// an unauthenticated header can't spam or forge log lines.
const EVENT_NAME = /^[a-z0-9_]{1,64}$/;
const UNKNOWN_EVENT = "unknown";
// Far above any delivery for the events routed here; GitHub's own cap is
// 25 MB. Bounds what an unauthenticated caller makes us buffer and HMAC.
const MAX_BODY_BYTES = 1024 * 1024;

type GithubWebhookDeps = {
  // null when GitHub is off.
  secret: string | null;
  boardSync: BoardSync;
};

// A board-sync trigger, or null for an event the portal ignores.
type Trigger = ((boardSync: BoardSync) => Promise<void>) | null;

class MalformedPayloadError extends Error {
  override name = "MalformedPayloadError";
}

export function createGithubWebhookHandler({
  secret,
  boardSync,
}: GithubWebhookDeps): (request: Request) => Promise<Response> {
  return async function handleGithubWebhook(request) {
    if (secret === null)
      return new Response(null, { status: SERVICE_UNAVAILABLE });

    const event = getEventName(request);
    // The raw text: the signature covers the exact bytes GitHub sent.
    const body = await readBody(request);
    if (body === null) {
      console.warn(`github-webhook: refused a ${event} delivery (too large)`);
      return new Response(null, { status: PAYLOAD_TOO_LARGE });
    }
    const signature = request.headers.get(SIGNATURE_HEADER);
    if (!isValidSignature(body, signature, secret)) {
      console.warn(
        `github-webhook: refused a ${event} delivery (bad signature)`,
      );
      return new Response(null, { status: UNAUTHORIZED });
    }

    let status = NO_CONTENT;
    try {
      const trigger = getTrigger(event, body);
      if (trigger !== null) await trigger(boardSync);
    } catch (error) {
      if (error instanceof MalformedPayloadError) {
        console.warn(
          `github-webhook: malformed ${event} delivery: ${error.message}`,
        );
        status = BAD_REQUEST;
      } else {
        console.error(
          `github-webhook: ${event} delivery failed: ${describeError(error)}`,
        );
        status = INTERNAL_SERVER_ERROR;
      }
    }
    // Sync failures are recorded on the board by the sync itself, so a
    // finished trigger is a 204 whatever the board's outcome.
    return new Response(null, { status });
  };
}

function getEventName(request: Request): string {
  const event = request.headers.get(EVENT_HEADER) ?? "";
  return EVENT_NAME.test(event) ? event : UNKNOWN_EVENT;
}

// The body as text, or null when it's over MAX_BODY_BYTES. Counts the bytes
// actually read, so a missing or lying Content-Length can't get past it.
async function readBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_BODY_BYTES) return null;
  if (request.body === null) return "";

  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  let isTooLarge = false;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    if (byteCount > MAX_BODY_BYTES) {
      isTooLarge = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return isTooLarge ? null : Buffer.concat(chunks).toString("utf8");
}

function isValidSignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (signature === null || !signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const hex = signature.slice(SIGNATURE_PREFIX.length);
  if (!SHA256_HEX.test(hex)) return false;

  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(Buffer.from(hex, "hex"), expected);
}

// Throws MalformedPayloadError when a routed event lacks its node id.
function getTrigger(event: string, body: string): Trigger {
  let trigger: Trigger = null;
  switch (event) {
    case "projects_v2": {
      const boardNodeId = readNodeId(body, ["projects_v2", "node_id"]);
      trigger = async (boardSync) => {
        await boardSync.refreshPool();
        // A deleted board freezes through the sync's not-in-pool path.
        await boardSync.syncBoardByNodeId(boardNodeId);
      };
      break;
    }
    case "projects_v2_item": {
      const boardNodeId = readNodeId(body, [
        "projects_v2_item",
        "project_node_id",
      ]);
      trigger = (boardSync) => boardSync.syncBoardByNodeId(boardNodeId);
      break;
    }
    case "projects_v2_status_update": {
      const boardNodeId = readNodeId(body, [
        "projects_v2_status_update",
        "project_node_id",
      ]);
      trigger = (boardSync) => boardSync.syncBoardByNodeId(boardNodeId);
      break;
    }
    case "issues": {
      const issueNodeId = readNodeId(body, ["issue", "node_id"]);
      trigger = (boardSync) => boardSync.syncBoardsWithIssue(issueNodeId);
      break;
    }
    case "milestone": {
      const repositoryNodeId = readNodeId(body, ["repository", "node_id"]);
      trigger = (boardSync) =>
        boardSync.syncBoardsWithRepository(repositoryNodeId);
      break;
    }
  }
  return trigger;
}

// The non-empty string at `path` in the JSON body.
function readNodeId(body: string, path: string[]): string {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new MalformedPayloadError("body isn't JSON");
  }
  for (const key of path) {
    value = isRecord(value) ? value[key] : undefined;
  }
  if (typeof value !== "string" || value === "") {
    throw new MalformedPayloadError(`missing ${path.join(".")}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
