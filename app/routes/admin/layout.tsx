import {
  data,
  matchPath,
  Outlet,
  useLocation,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import AdminShell from "@/components/admin/admin-shell";
import BoardDetailSkeleton from "@/components/admin/board-detail-skeleton";
import ClientRequestsSkeleton from "@/components/admin/client-requests-skeleton";
import RequestTriageSkeleton from "@/components/admin/request-triage-skeleton";
import RequestsInboxSkeleton from "@/components/admin/requests-inbox-skeleton";
import ProjectsSkeleton from "@/components/admin/projects-skeleton";
import TeamSkeleton from "@/components/admin/team-skeleton";
import { auth } from "@/lib/auth/auth.server";
import { boardSync } from "@/lib/board-sync/board-sync.server";
import {
  getCreatedClientId,
  isInviteFlagRemoval,
  isNewClientDrawerToggle,
  TEAM_ROUTE_PATTERN,
} from "@/lib/new-client";
import {
  getLinkedProject,
  isLinkDrawerToggle,
  PROJECTS_ROUTE_PATTERN,
} from "@/lib/link-board";
import { isMapDrawerToggle } from "@/lib/projects";
import { BOARD_ROUTE_PATTERN } from "@/lib/board-detail";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import {
  CLIENT_REQUEST_ROUTE_PATTERN,
  CLIENT_REQUESTS_ROUTE_PATTERN,
  INBOX_REQUEST_ROUTE_PATTERN,
  INBOX_ROUTE_PATTERN,
} from "@/lib/admin-requests";
import { describeError } from "@/lib/describe-error";
import { requests } from "@/lib/requests/requests.server";
import type { Route } from "./+types/layout";

const METHOD_NOT_ALLOWED = 405;

// Guards every page under /admin. Child routes still call requireAdmin in
// their own loaders and actions: this loader runs alongside theirs, not
// before, and never before an action.
export async function loader({ request }: Route.LoaderArgs) {
  const { email, headers } = await requireAdmin(request);
  // The sidebar's roster: if it can't load, the shell still renders and the
  // sidebar says so (Home's panel offers the retry).
  // Archived Clients feed the sidebar's Archived group and Home's panel,
  // which reads them from here (one query); null when they can't load.
  // The sidebar's sync-problem icons: none if they can't load.
  // New Requests by active Client: the Requests entry's total (and the
  // Clients' alert icons); none if they can't load.
  const [clients, archivedClients, syncProblemClientIds, newRequestCounts] =
    await Promise.all([
      auth.listClients().catch((error: unknown) => {
        console.error("admin: couldn't load the sidebar's Clients", error);
        return null;
      }),
      auth.listArchivedClients().catch((error: unknown) => {
        console.error("admin: couldn't load the archived Clients", error);
        return null;
      }),
      boardSync.listSyncProblemClientIds().catch((error: unknown) => {
        console.error("admin: couldn't load the sync-problem Clients", error);
        return [];
      }),
      requests
        .countNewByClient()
        .catch((error: unknown): Record<string, number> => {
          console.error(
            `admin: couldn't load the New Request counts (${describeError(error)})`,
          );
          return {};
        }),
    ]);
  return data(
    {
      email,
      clients,
      archivedClients,
      syncProblemClientIds,
      newRequestCounts,
    },
    { headers },
  );
}

// A POST to /admin itself lands here. The guard answers first, then the
// Admin gets what React Router gives a route with no action.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw data(null, { status: METHOD_NOT_ALLOWED, headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return (
    revalidateUnlessThemeFailed(args) &&
    !isNewClientDrawerToggle(args) &&
    !isLinkDrawerToggle(args) &&
    !isMapDrawerToggle(args) &&
    !isInviteFlagRemoval(args)
  );
}

export default function AdminLayout({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const loadingTab = useLoadingWorkspaceTab();

  const content =
    loadingTab === null ? <Outlet /> : WORKSPACE_SKELETONS[loadingTab];
  return (
    <AdminShell
      email={loaderData.email}
      clients={loaderData.clients}
      archivedClients={loaderData.archivedClients}
      syncProblemClientIds={loaderData.syncProblemClientIds}
      newRequestCounts={loaderData.newRequestCounts}
    >
      {content}
    </AdminShell>
  );
}

type LoadingTab =
  | "team"
  | "projects"
  | "board"
  | "requests"
  | "request"
  | "inbox"
  | "inbox-request";

const WORKSPACE_SKELETONS: Record<LoadingTab, React.ReactNode> = {
  team: <TeamSkeleton />,
  projects: <ProjectsSkeleton />,
  board: <BoardDetailSkeleton />,
  requests: <ClientRequestsSkeleton />,
  request: <RequestTriageSkeleton route="client" />,
  inbox: <RequestsInboxSkeleton />,
  "inbox-request": <RequestTriageSkeleton route="inbox" />,
};

// Checked in order: the first pattern the target matches names its
// skeleton.
const LOADING_TAB_PATTERNS: [string, LoadingTab][] = [
  [TEAM_ROUTE_PATTERN, "team"],
  [BOARD_ROUTE_PATTERN, "board"],
  [PROJECTS_ROUTE_PATTERN, "projects"],
  [CLIENT_REQUEST_ROUTE_PATTERN, "request"],
  [CLIENT_REQUESTS_ROUTE_PATTERN, "requests"],
  [INBOX_REQUEST_ROUTE_PATTERN, "inbox-request"],
  [INBOX_ROUTE_PATTERN, "inbox"],
];

// The workspace tabs' and the Requests pages' loaders are awaited, so a
// client-side navigation into another page shows its skeleton meanwhile.
// Not after a create or a link: the drawer's pending label covers that
// wait. A same-path navigation (the inbox filter) is the page's own.
function useLoadingWorkspaceTab(): LoadingTab | null {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const target = navigation.location;
  if (
    navigation.state !== "loading" ||
    !target ||
    target.pathname === pathname
  ) {
    return null;
  }
  if (getCreatedClientId(target.state) !== null) return null;
  if (getLinkedProject(target.state) !== null) return null;

  const match = LOADING_TAB_PATTERNS.find(
    ([pattern]) => matchPath(pattern, target.pathname) !== null,
  );
  return match?.[1] ?? null;
}
