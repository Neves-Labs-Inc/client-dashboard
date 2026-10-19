import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import ProjectView from "@/components/projects/project-view";
import { useClientPaths } from "@/hooks/use-client-paths";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
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
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/project";

const NOT_FOUND = 404;

export function meta({
  loaderData,
  error,
  matches,
}: Route.MetaArgs): Route.MetaDescriptors {
  let title = getPreviewTitle("Projects");
  if (loaderData) {
    title = getPreviewTitle(loaderData.project.name, loaderData.clientName);
  } else if (isRouteErrorResponse(error) && error.status === NOT_FOUND) {
    title = getPreviewTitle("Project not found", getLayoutClientName(matches));
  }
  return [{ title }];
}

// The client Project view, for the URL's Client: another Client's Project,
// an unknown id and a non-UUID id all read as null and 404 alike.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const project = await clientProjects.getProject(
    client.clientId,
    params.projectId,
  );
  if (project === null) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data({ clientName: client.clientName, project }, { headers });
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
      title="Projects"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
      notFound={{
        title: "Project not found",
        backHref: paths.projects,
        backLabel: "Back to Projects",
      }}
    />
  );
}

export default function PreviewProjectPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <ProjectView {...loaderData} />;
}
