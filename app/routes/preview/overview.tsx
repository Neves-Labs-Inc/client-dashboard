import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import OverviewKpis from "@/components/client/overview-kpis";
import ProjectsPanel from "@/components/projects/projects-panel";
import RequestsPanel, {
  OVERVIEW_REQUEST_LIMIT,
} from "@/components/requests/requests-panel";
import PageHeader from "@/components/ui/page-header";
import { useClientPaths } from "@/hooks/use-client-paths";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { getPreviewTitle, PREVIEW_LAYOUT_ROUTE_ID } from "@/lib/preview";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/overview";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: getPreviewTitle("Overview", loaderData?.clientName) }];
}

// The client Overview's lists, for the URL's Client: streamed un-awaited, so
// the page and its skeleton render first, and a failed load resolves to null
// (the KPI row's "—" and the panel's error state). No project options: there
// is no drawer to submit from.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const { clientId, clientName } = client;
  const projects = clientProjects.listProjects(clientId).catch((error) => {
    console.error(
      `preview: couldn't load the Overview Projects (${describeError(error)})`,
      { clientId },
    );
    return null;
  });
  // One more than shown, so the panel knows whether to offer "View all".
  const recentRequests = requests
    .listRequests(clientId, { limit: OVERVIEW_REQUEST_LIMIT + 1 })
    .catch((error) => {
      console.error(
        `preview: couldn't load the Overview Requests (${describeError(error)})`,
        { clientId },
      );
      return null;
    });
  return data({ clientName, projects, requests: recentRequests }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Overview"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
    />
  );
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

// The client Overview without "New request" or its drawer (`?new=request`
// opens nothing here).
export default function PreviewOverviewPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const paths = useClientPaths();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: loaderData.clientName, isTruncated: true },
          { label: "Overview" },
        ]}
        title="Overview"
      />
      <OverviewKpis projects={loaderData.projects} />
      <ProjectsPanel
        projects={loaderData.projects}
        titleHref={paths.projects}
      />
      {/* A grid so Phase 7 can put Invoices beside the Requests at xl. */}
      <div className="grid grid-cols-1 gap-4">
        <RequestsPanel requests={loaderData.requests} isReadOnly />
      </div>
    </div>
  );
}
