import {
  data,
  Outlet,
  useLocation,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientShell from "@/components/client/client-shell";
import ClientTeamSkeleton from "@/components/client/client-team-skeleton";
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
  const isLoadingTeam = useIsNavigatingToTeam();

  return (
    <ClientShell {...loaderData}>
      {isLoadingTeam ? <ClientTeamSkeleton /> : <Outlet />}
    </ClientShell>
  );
}

// The Team loader is awaited, so a client-side navigation into /team shows
// its skeleton meanwhile.
function useIsNavigatingToTeam(): boolean {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const target = navigation.location;
  return (
    navigation.state === "loading" &&
    target !== undefined &&
    target.pathname !== pathname &&
    target.pathname === TEAM_PATH
  );
}
