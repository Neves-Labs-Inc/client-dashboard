import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import ProjectsPanel from "@/components/projects/projects-panel";
import PageHeader from "@/components/ui/page-header";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { getPreviewTitle, PREVIEW_LAYOUT_ROUTE_ID } from "@/lib/preview";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/projects";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: getPreviewTitle("Projects", loaderData?.clientName) }];
}

// The client Projects list, for the URL's Client: streamed un-awaited, a
// failed load resolving to null (the panel's error state).
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const { clientId, clientName } = client;
  const projects = clientProjects.listProjects(clientId).catch((error) => {
    console.error(
      `preview: couldn't load the Projects (${describeError(error)})`,
      { clientId },
    );
    return null;
  });
  return data({ clientName, projects }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Projects"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
    />
  );
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function PreviewProjectsPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: loaderData.clientName, isTruncated: true },
          { label: "Projects" },
        ]}
        title="Projects"
      />
      <ProjectsPanel projects={loaderData.projects} />
    </div>
  );
}
