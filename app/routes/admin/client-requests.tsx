import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRequestsView from "@/components/admin/client-requests-view";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { loadClientWorkspace } from "@/lib/request-triage.server";
import type { RequestRow } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-requests";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.client?.name;
  const title = name ? `${name} · Requests` : "Requests";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Awaited, not streamed: an unknown Client must be a 404, and the admin
// layout shows the skeleton meanwhile. A failed load resolves to null (the
// page's error state), so the shell stays. Archived Clients included.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const [client, rows] = await Promise.all([
    loadClientWorkspace(params.clientId),
    loadClientRequests(params.clientId),
  ]);
  if (client === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data({ client, rows }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

async function loadClientRequests(
  clientId: string,
): Promise<RequestRow[] | null> {
  try {
    return await requests.listClientRequests(clientId);
  } catch (error) {
    console.error(
      `admin: couldn't load the Client's Requests (${describeError(error)})`,
      { clientId },
    );
    return null;
  }
}

export default function ClientRequests({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  // Keyed, so another Client's tab starts with fresh focus state.
  return (
    <ClientRequestsView
      key={params.clientId}
      clientId={params.clientId}
      client={loaderData.client}
      rows={loaderData.rows}
    />
  );
}
