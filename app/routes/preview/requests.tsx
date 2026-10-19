import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import RequestsPage from "@/components/requests/requests-page";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { getPreviewTitle, PREVIEW_LAYOUT_ROUTE_ID } from "@/lib/preview";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/requests";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: getPreviewTitle("Requests", loaderData?.clientName) }];
}

// The client Requests list, for the URL's Client. Awaited; a failed list is
// null (the panel's error state), so the page stays. No project options:
// there is no drawer to submit from.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const { clientId, clientName } = client;
  let list: Awaited<ReturnType<typeof requests.listRequests>> | null = null;
  try {
    list = await requests.listRequests(clientId);
  } catch (error) {
    console.error(
      `preview: couldn't load the Requests (${describeError(error)})`,
      { clientId },
    );
  }
  return data({ clientName, requests: list }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Requests"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
    />
  );
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function PreviewRequestsPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <RequestsPage {...loaderData} isReadOnly />;
}
