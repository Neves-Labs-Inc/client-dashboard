import { boardSync } from "@/lib/board-sync/board-sync.server";
import { getAppEnv } from "@/lib/env";
import { createReconcileHandler } from "@/lib/reconcile-job";
import type { Route } from "./+types/jobs.reconcile";

const METHOD_NOT_ALLOWED = 405;

const env = getAppEnv();
// Resource route for Vercel Cron (vercel.json). Env validation guarantees
// all GitHub vars or none, so one stands for the group.
const handleReconcile = createReconcileHandler({
  cronSecret: env.CRON_SECRET ?? null,
  githubEnabled: env.GITHUB_APP_ID !== undefined,
  boardSync,
});

export function loader({ request }: Route.LoaderArgs): Promise<Response> {
  return handleReconcile(request);
}

// Vercel Cron only GETs.
export function action(): Response {
  return new Response(null, {
    status: METHOD_NOT_ALLOWED,
    headers: { Allow: "GET" },
  });
}
