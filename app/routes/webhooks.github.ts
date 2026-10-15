import { boardSync } from "@/lib/board-sync/board-sync.server";
import { getAppEnv } from "@/lib/env";
import { createGithubWebhookHandler } from "@/lib/github-webhook";
import type { Route } from "./+types/webhooks.github";

const METHOD_NOT_ALLOWED = 405;

// Resource route for the GitHub App's deliveries; no session involved.
const handleGithubWebhook = createGithubWebhookHandler({
  secret: getAppEnv().GITHUB_WEBHOOK_SECRET ?? null,
  boardSync,
});

// GitHub only POSTs.
export function loader(): Response {
  return new Response(null, {
    status: METHOD_NOT_ALLOWED,
    headers: { Allow: "POST" },
  });
}

export function action({ request }: Route.ActionArgs): Promise<Response> {
  return handleGithubWebhook(request);
}
