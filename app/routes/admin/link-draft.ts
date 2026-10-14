import { data } from "react-router";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { boardSync } from "@/lib/board-sync/board-sync.server";
import type { LinkDraftOutcome } from "@/lib/link-board";
import type { Route } from "./+types/link-draft";

type OutcomeResponse = ReturnType<typeof data<LinkDraftOutcome>>;

// The Link drawer's data, fetched by the drawer once it opens, so Admin
// Home never waits on GitHub. A resource route: it has no page.
export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<OutcomeResponse> {
  const { headers } = await requireAdmin(request);
  const boardNodeId = params.nodeId;
  const result = await boardSync.getLinkDraft(boardNodeId);
  const outcome: LinkDraftOutcome =
    result.error === null
      ? { kind: "ready", boardNodeId, ...result.value }
      : { kind: "refused", boardNodeId, error: result.error };
  headers.set("cache-control", "private, no-store");
  return data(outcome, { status: result.status, headers });
}

// A network failure (or a crash) becomes the drawer's retry instead of the
// route's error boundary. The guard's redirects still go through.
export async function clientLoader({
  serverLoader,
  params,
}: Route.ClientLoaderArgs): Promise<LinkDraftOutcome> {
  try {
    return await serverLoader();
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("admin: the link-draft request failed", error);
    return { kind: "failed", boardNodeId: params.nodeId };
  }
}

// Never with the page: a revalidation (after an action, or the drawer's own
// refresh of Home) would repeat the live GitHub call and replace the draft
// the Admin is editing. The drawer reloads it itself.
export function shouldRevalidate(): boolean {
  return false;
}
