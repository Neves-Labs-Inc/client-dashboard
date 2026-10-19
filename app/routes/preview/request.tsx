import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import RequestDetailView from "@/components/requests/request-detail-view";
import { useClientPaths } from "@/hooks/use-client-paths";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  getLayoutClientName,
  getPreviewTitle,
  PREVIEW_LAYOUT_ROUTE_ID,
} from "@/lib/preview";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/request";

const NOT_FOUND = 404;
// The preview acts as no user, so no Request is ever the viewer's own.
const NO_USER_ID = "";

export function meta({
  loaderData,
  error,
  matches,
}: Route.MetaArgs): Route.MetaDescriptors {
  let title = getPreviewTitle("Requests");
  if (loaderData) {
    title = getPreviewTitle(loaderData.detail.title, loaderData.clientName);
  } else if (isRouteErrorResponse(error) && error.status === NOT_FOUND) {
    title = getPreviewTitle("Request not found", getLayoutClientName(matches));
  }
  return [{ title }];
}

// The client Request detail, for the URL's Client: another Client's Request,
// an unknown id and a non-UUID id all read as null and 404 alike. Read as a
// viewer who isn't the submitter, so no change control ever shows.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const found = await requests.getRequest(
    { clientId: client.clientId, userId: NO_USER_ID },
    params.requestId,
  );
  if (found === null) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  const detail = { ...found, canChange: false };
  return data({ clientName: client.clientName, detail }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export function ErrorBoundary(): React.ReactNode {
  const paths = useClientPaths();

  return (
    <ClientRouteError
      title="Requests"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
      notFound={{
        title: "Request not found.",
        backHref: paths.requests,
        backLabel: "Back to Requests",
      }}
    />
  );
}

export default function PreviewRequestPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return (
    <RequestDetailView key={loaderData.detail.id} {...loaderData} isReadOnly />
  );
}
