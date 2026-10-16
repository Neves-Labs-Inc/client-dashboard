import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import BoardDetailView from "@/components/admin/board-detail-view";
import BoardNotFound from "@/components/admin/board-not-found";
import type { ClientWorkspace } from "@/components/admin/client-workspace-header";
import { auth } from "@/lib/auth/auth.server";
import { requireAdmin } from "@/lib/auth/require-access.server";
import type { BoardDetail } from "@/lib/board-sync/board-sync";
import { boardSync } from "@/lib/board-sync/board-sync.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-board";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.detail?.name;
  const title = name ? `${name} · Projects` : "Projects";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Awaited, not streamed: an unknown or another Client's Project must be a
// 404, and the admin layout shows the skeleton meanwhile. A failed load
// resolves to null (the page's error state) instead of throwing, so the
// shell stays. Reads run as app_system, scoped by the URL's Client.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const [client, detail] = await Promise.all([
    loadClient(params.clientId),
    loadDetail(params.clientId, params.projectId),
  ]);
  if (client === "not-found" || detail === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(
    {
      client,
      detail,
      isGithubConnected: boardSync.isGithubConnected,
      // One clock for the server render and hydration (sync-problem line).
      nowMs: Date.now(),
    },
    { headers },
  );
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

async function loadClient(
  clientId: string,
): Promise<ClientWorkspace | "not-found" | null> {
  try {
    const team = await auth.getTeam(clientId);
    return team === null
      ? "not-found"
      : {
          clientId: team.clientId,
          name: team.name,
          archivedAt: team.archivedAt,
        };
  } catch (error) {
    console.error("admin: couldn't load the Client", { clientId, error });
    return null;
  }
}

async function loadDetail(
  clientId: string,
  projectId: string,
): Promise<BoardDetail | "not-found" | null> {
  try {
    const detail = await boardSync.getBoardDetail(clientId, projectId);
    return detail ?? "not-found";
  } catch (error) {
    console.error(
      `admin: couldn't load the board detail (${describeError(error)})`,
      { clientId, projectId },
    );
    return null;
  }
}

export default function ClientBoard({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  const { client, detail, isGithubConnected, nowMs } = loaderData;

  // Keyed, so another board starts with fresh sync and focus state.
  return (
    <BoardDetailView
      key={params.projectId}
      clientId={params.clientId}
      client={client}
      detail={detail}
      isGithubConnected={isGithubConnected}
      nowMs={nowMs}
    />
  );
}

// A 404 (unknown or another Client's Project) in the main column; anything
// else goes on to the root boundary.
export function ErrorBoundary({
  error,
  params,
}: Route.ErrorBoundaryProps): React.ReactNode {
  if (!isRouteErrorResponse(error) || error.status !== NOT_FOUND) throw error;

  return <BoardNotFound clientId={params.clientId ?? ""} />;
}
