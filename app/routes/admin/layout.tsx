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
  const [clients, archivedClients, syncProblemClientIds] = await Promise.all([
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
  ]);
  return data(
    { email, clients, archivedClients, syncProblemClientIds },
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

  let content = <Outlet />;
  if (loadingTab === "team") {
    content = <TeamSkeleton />;
  } else if (loadingTab === "projects") {
    content = <ProjectsSkeleton />;
  } else if (loadingTab === "board") {
    content = <BoardDetailSkeleton />;
  }
  return (
    <AdminShell
      email={loaderData.email}
      clients={loaderData.clients}
      archivedClients={loaderData.archivedClients}
      syncProblemClientIds={loaderData.syncProblemClientIds}
    >
      {content}
    </AdminShell>
  );
}

// The workspace tabs' loaders are awaited, so a client-side navigation into
// another Client's tab (or a board detail) shows its skeleton meanwhile. Not after a create or a
// link: the drawer's pending label covers that wait.
function useLoadingWorkspaceTab(): "team" | "projects" | "board" | null {
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

  let tab: "team" | "projects" | "board" | null = null;
  if (matchPath(TEAM_ROUTE_PATTERN, target.pathname) !== null) {
    tab = "team";
  } else if (matchPath(BOARD_ROUTE_PATTERN, target.pathname) !== null) {
    tab = "board";
  } else if (matchPath(PROJECTS_ROUTE_PATTERN, target.pathname) !== null) {
    tab = "projects";
  }
  return tab;
}
