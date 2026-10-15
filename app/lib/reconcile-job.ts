import { createHash, timingSafeEqual } from "node:crypto";
import type { BoardSync } from "@/lib/board-sync/board-sync";

// GET /jobs/reconcile: Vercel Cron's 15-minute poll, so missed webhook
// deliveries heal. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.

const UNAUTHORIZED = 401;
const SERVICE_UNAVAILABLE = 503;

type ReconcileJobDeps = {
  // null when CRON_SECRET is unset.
  cronSecret: string | null;
  githubEnabled: boolean;
  boardSync: BoardSync;
};

export function createReconcileHandler({
  cronSecret,
  githubEnabled,
  boardSync,
}: ReconcileJobDeps): (request: Request) => Promise<Response> {
  return async function handleReconcile(request) {
    if (!githubEnabled || cronSecret === null) {
      return new Response(null, { status: SERVICE_UNAVAILABLE });
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (!isSameSecret(authorization, `Bearer ${cronSecret}`)) {
      console.warn("reconcile-job: refused a request (bad bearer)");
      return new Response(null, { status: UNAUTHORIZED });
    }

    const outcome = await boardSync.reconcile();
    return Response.json(outcome, {
      headers: { "cache-control": "private, no-store" },
    });
  };
}

// Hashing first gives timingSafeEqual equal-length inputs, so the compare
// leaks neither the content nor the length of the expected value.
function isSameSecret(given: string, expected: string): boolean {
  const givenDigest = createHash("sha256").update(given).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(givenDigest, expectedDigest);
}
