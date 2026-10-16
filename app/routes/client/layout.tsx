import {
  data,
  Outlet,
  useLocation,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientShell from "@/components/client/client-shell";
import ProjectViewSkeleton from "@/components/client/project-view-skeleton";
import OverviewSkeleton from "@/components/client/overview-skeleton";
import ClientTeamSkeleton from "@/components/client/client-team-skeleton";
import ProfileSkeleton from "@/components/client/profile-skeleton";
import ProjectsPageSkeleton from "@/components/projects/projects-page-skeleton";
import RequestDetailSkeleton from "@/components/requests/request-detail-skeleton";
import RequestsPageSkeleton from "@/components/requests/requests-page-skeleton";
import { useWelcomeToast } from "@/hooks/use-welcome-toast";
import { PROFILE_PATH } from "@/lib/profile";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { isRequestDrawerToggle, REQUESTS_PATH } from "@/lib/request-drawer";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/layout";

const OVERVIEW_PATH = "/overview";
const TEAM_PATH = "/team";
const PROJECTS_PATH = "/projects";
// One Project's view: /projects/<id>, not /projects itself.
const PROJECT_VIEW_PATH = /^\/projects\/[^/]+$/;
const REQUEST_VIEW_PATH = /^\/requests\/[^/]+$/;

// Guards every page of the client area. Child routes still call
// requireClientUser in their own loaders and actions: this loader runs
// alongside theirs, not before, and never before an action.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName, name, email, role } = access;
  const [activeProjectCount, newRequestCount] = await Promise.all([
    loadNavCount("the active Projects", clientId, () =>
      clientProjects.countActiveProjects(clientId),
    ),
    loadNavCount("the New Requests", clientId, () =>
      requests.countNewRequests(clientId),
    ),
  ]);
  return data(
    { clientName, name, email, role, activeProjectCount, newRequestCount },
    { headers },
  );
}

// The nav counts are a nicety: when one fails the shell still renders,
// without it. Only the error's name and code are logged.
async function loadNavCount(
  what: string,
  clientId: string,
  count: () => Promise<number>,
): Promise<number | null> {
  let total: number | null = null;
  try {
    total = await count();
  } catch (error) {
    console.error(`client: couldn't count ${what} (${describeError(error)})`, {
      clientId,
    });
  }
  return total;
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isRequestDrawerToggle(args);
}

export default function ClientLayout({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const loadingPath = useNavigatingToPath();
  useWelcomeToast(loaderData.clientName);

  return (
    <ClientShell {...loaderData}>
      {getSkeleton(loadingPath, loaderData.role) ?? <Outlet />}
    </ClientShell>
  );
}

function getSkeleton(
  path: string | null,
  role: "owner" | "member",
): React.ReactNode {
  let skeleton: React.ReactNode = null;
  if (path === OVERVIEW_PATH) {
    skeleton = <OverviewSkeleton />;
  } else if (path === TEAM_PATH) {
    skeleton = <ClientTeamSkeleton isOwner={role === "owner"} />;
  } else if (path === PROJECTS_PATH) {
    skeleton = <ProjectsPageSkeleton />;
  } else if (path === PROFILE_PATH) {
    skeleton = <ProfileSkeleton />;
  } else if (path === REQUESTS_PATH) {
    skeleton = <RequestsPageSkeleton />;
  } else if (path !== null && PROJECT_VIEW_PATH.test(path)) {
    skeleton = <ProjectViewSkeleton />;
  } else if (path !== null && REQUEST_VIEW_PATH.test(path)) {
    skeleton = <RequestDetailSkeleton />;
  }
  return skeleton;
}

// The Overview, Team, Profile, Projects, Project view, Requests and Request
// detail loaders are awaited
// (Overview and Projects stream their list, but the page still loads first),
// so a client-side navigation into any of them shows its skeleton meanwhile.
// The path being loaded, or null when no other page is.
function useNavigatingToPath(): string | null {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const target = navigation.location;
  const isChangingPage =
    navigation.state === "loading" &&
    target !== undefined &&
    target.pathname !== pathname;
  return isChangingPage ? target.pathname : null;
}
