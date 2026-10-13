import { data, Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import AdminShell from "@/components/admin/admin-shell";
import { auth } from "@/lib/auth/auth.server";
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
  const clients = await auth.listClients().catch((error: unknown) => {
    console.error("admin: couldn't load the sidebar's Clients", error);
    return null;
  });
  return data({ email, clients }, { headers });
}

// A POST to /admin itself lands here. The guard answers first, then the
// Admin gets what React Router gives a route with no action.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw data(null, { status: METHOD_NOT_ALLOWED, headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function AdminLayout({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return (
    <AdminShell email={loaderData.email} clients={loaderData.clients}>
      <Outlet />
    </AdminShell>
  );
}
