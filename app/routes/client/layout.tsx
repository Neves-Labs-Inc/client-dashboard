import {
  data,
  Outlet,
  useLocation,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientShell from "@/components/client/client-shell";
import ClientTeamSkeleton from "@/components/client/client-team-skeleton";
import ProfileSkeleton from "@/components/client/profile-skeleton";
import { useWelcomeToast } from "@/hooks/use-welcome-toast";
import { PROFILE_PATH } from "@/lib/profile";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/layout";

const TEAM_PATH = "/team";

// Guards every page of the client area. Child routes still call
// requireClientUser in their own loaders and actions: this loader runs
// alongside theirs, not before, and never before an action.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientName, name, email, role } = access;
  return data({ clientName, name, email, role }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
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
  if (path === TEAM_PATH) {
    skeleton = <ClientTeamSkeleton isOwner={role === "owner"} />;
  } else if (path === PROFILE_PATH) {
    skeleton = <ProfileSkeleton />;
  }
  return skeleton;
}

// The Team and Profile loaders are awaited, so a client-side navigation into
// either shows its skeleton meanwhile. The path being loaded, or null when
// no other page is.
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
