import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import ProjectsPanel from "@/components/projects/projects-panel";
import PageHeader from "@/components/ui/page-header";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/projects";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.clientName;
  const title = clientName ? `Projects · ${clientName}` : "Projects";
  return [{ title: `${title} · Neves Labs` }];
}

// The list streams in un-awaited, so the page and its skeleton render first.
// Scoped by the session's Client, never by the URL. A failed load resolves
// to null (the panel's error state): a rejection reaching the browser before
// <Await> renders would be unhandled there and carry the driver's error. The
// real error is logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName } = access;
  const projects = clientProjects.listProjects(clientId).catch((error) => {
    console.error(
      `client: couldn't load the Projects (${describeError(error)})`,
      { clientId },
    );
    return null;
  });
  return data({ clientName, projects }, { headers });
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return <ClientRouteError title="Projects" />;
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function ClientProjectsPage({
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
