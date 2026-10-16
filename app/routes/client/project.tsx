import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import ProjectView from "@/components/projects/project-view";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/project";

const NOT_FOUND = 404;
const PROJECTS_PATH = "/projects";

export function meta({
  loaderData,
  error,
}: Route.MetaArgs): Route.MetaDescriptors {
  let title = "Projects";
  if (loaderData) {
    title = loaderData.project.name;
  } else if (isRouteErrorResponse(error) && error.status === NOT_FOUND) {
    title = "Project not found";
  }
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client: another Client's Project, an
// unknown id and a non-UUID id all read as null, so they 404 alike and the
// page never confirms that an id exists elsewhere.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const project = await clientProjects.getProject(
    access.clientId,
    params.projectId,
  );
  if (project === null) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data({ clientName: access.clientName, project }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Projects"
      notFound={{
        title: "Project not found",
        backHref: PROJECTS_PATH,
        backLabel: "Back to Projects",
      }}
    />
  );
}

export default function ProjectPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <ProjectView {...loaderData} />;
}
