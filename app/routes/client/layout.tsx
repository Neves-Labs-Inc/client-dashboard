import { data, Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { getClientPageSkeleton } from "@/components/client/client-page-skeleton";
import ClientShell from "@/components/client/client-shell";
import ClientTeamSkeleton from "@/components/client/client-team-skeleton";
import ProfileSkeleton from "@/components/client/profile-skeleton";
import { useNavigatingToPath } from "@/hooks/use-navigating-to-path";
import { useWelcomeToast } from "@/hooks/use-welcome-toast";
import { PROFILE_PATH } from "@/lib/profile";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { CLIENT_PATHS, getClientPage } from "@/lib/client-paths";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { describeError } from "@/lib/describe-error";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { isRequestDrawerToggle } from "@/lib/request-drawer";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/layout";

const TEAM_PATH = "/team";

// Guards every page of the client area. Child routes still call
// requireClientUser in their own loaders and actions: this loader runs
// alongside theirs, not before, and never before an action.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName, name, email, role } = access;
  const [activeProjectCount, newRequestCount, openInvoiceCount] =
    await Promise.all([
      loadNavCount("the active Projects", clientId, () =>
        clientProjects.countActiveProjects(clientId),
      ),
      loadNavCount("the New Requests", clientId, () =>
        requests.countNewRequests(clientId),
      ),
      // Open and Overdue alike.
      loadNavCount("the open Invoices", clientId, () =>
        invoices
          .getInvoiceSummary(clientId)
          .then((summary) => summary.openCount),
      ),
    ]);
  return data(
    {
      clientName,
      name,
      email,
      role,
      activeProjectCount,
      newRequestCount,
      openInvoiceCount,
    },
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

// The Overview, Team, Profile, Projects, Project view, Requests, Request
// detail, Invoices and Invoice detail loaders are awaited
// (Overview and Projects stream their list, but the page still loads first),
// so a client-side navigation into any of them shows its skeleton meanwhile.
function getSkeleton(
  path: string | null,
  role: "owner" | "member",
): React.ReactNode {
  let skeleton: React.ReactNode = null;
  if (path === TEAM_PATH) {
    skeleton = <ClientTeamSkeleton isOwner={role === "owner"} />;
  } else if (path === PROFILE_PATH) {
    skeleton = <ProfileSkeleton />;
  } else if (path !== null) {
    skeleton = getClientPageSkeleton(getClientPage(path, CLIENT_PATHS));
  }
  return skeleton;
}
