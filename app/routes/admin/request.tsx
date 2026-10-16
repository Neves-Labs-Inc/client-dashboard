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
import { loadTriage, runTriageAction } from "@/lib/request-triage.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/request";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const title = loaderData?.request?.title ?? "Requests";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// The triage detail from the inbox. Awaited, not streamed: an unknown or
// non-UUID id must be a 404, and the admin layout shows the skeleton
// meanwhile. A failed load resolves to null (the page's error state).
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const triage = await loadTriage(params.requestId);
  if (triage === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(triage, { headers });
}

export function action({
  request,
  params,
}: Route.ActionArgs): Promise<TriageResponse> {
  return runTriageAction(request, params.requestId);
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

export default function InboxRequest({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  // Keyed, so another Request starts with a fresh form.
  return (
    <RequestTriageView
      key={params.requestId}
      route="inbox"
      request={loaderData.request}
      taskOptions={loaderData.taskOptions}
    />
  );
}

// A 404 (unknown or non-UUID id) in the main column; anything else goes on
// to the root boundary.
export function ErrorBoundary({
  error,
}: Route.ErrorBoundaryProps): React.ReactNode {
  if (!isRouteErrorResponse(error) || error.status !== NOT_FOUND) throw error;

  return <RequestNotFound route="inbox" />;
}
