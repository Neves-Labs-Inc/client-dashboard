import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import RequestNotFound from "@/components/admin/request-not-found";
import RequestTriageView from "@/components/admin/request-triage-view";
import {
  isReadOnlyRefusal,
  runTriageClientAction,
  type TriageOutcome,
  type TriageResponse,
} from "@/lib/admin-requests";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  loadClientWorkspace,
  loadTriage,
  runTriageAction,
} from "@/lib/request-triage.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-request";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.client?.name;
  const title = name ? `${name} · Requests` : "Requests";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// The triage detail in place of the Client's Requests tab. Awaited, not
// streamed: an unknown Client, or a Request that isn't this Client's, must
// be a 404. A failed load resolves to null (the page's error state).
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const [client, triage] = await Promise.all([
    loadClientWorkspace(params.clientId),
    loadTriage(params.requestId, params.clientId),
  ]);
  if (client === "not-found" || triage === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data({ client, ...triage }, { headers });
}

export function action({
  request,
  params,
}: Route.ActionArgs): Promise<TriageResponse> {
  return runTriageAction(request, params.requestId, params.clientId);
}

export function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<TriageOutcome | TriageResponse> {
  return runTriageClientAction(serverAction);
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) || isReadOnlyRefusal(args);
}

export default function ClientRequest({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  // Keyed, so another Request starts with a fresh form.
  return (
    <RequestTriageView
      key={params.requestId}
      route="client"
      clientId={params.clientId}
      client={loaderData.client}
      request={loaderData.request}
      taskOptions={loaderData.taskOptions}
    />
  );
}

// A 404 (unknown Client, or an unknown, non-UUID or another Client's
// Request) in the main column; anything else goes on to the root boundary.
export function ErrorBoundary({
  error,
  params,
}: Route.ErrorBoundaryProps): React.ReactNode {
  if (!isRouteErrorResponse(error) || error.status !== NOT_FOUND) throw error;

  return <RequestNotFound route="client" clientId={params.clientId ?? ""} />;
}
