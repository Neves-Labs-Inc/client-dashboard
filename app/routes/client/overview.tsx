import { useCallback, useRef } from "react";
import {
  data,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import OverviewKpis from "@/components/client/overview-kpis";
import ProjectsPanel from "@/components/projects/projects-panel";
import NewRequestLink from "@/components/requests/new-request-link";
import RequestDrawer from "@/components/requests/request-drawer";
import RequestsPanel, {
  OVERVIEW_REQUEST_LIMIT,
} from "@/components/requests/requests-panel";
import PageHeader from "@/components/ui/page-header";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { EMPTY_REQUEST } from "@/hooks/use-request-form";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  isRequestDrawerToggle,
  NEW_REQUEST_PARAM,
  NEW_REQUEST_VALUE,
  SUBMIT_REQUEST_ACTION,
} from "@/lib/request-drawer";
import { REQUEST_COPY } from "@/lib/request-outcome";
import type { ProjectOption } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import { toast } from "@/lib/toast";
import type { Route } from "./+types/overview";

const PROJECTS_PATH = "/projects";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.clientName;
  const title = clientName ? `Overview · ${clientName}` : "Overview";
  return [{ title: `${title} · Neves Labs` }];
}

// The lists stream in un-awaited, so the page and its skeleton render first;
// each has its own promise, so one failing leaves the other. The drawer's
// project options are awaited: they are small and the drawer needs them.
// Scoped by the session's Client, never by the URL. A failed load resolves
// to null (the KPI row's "—" and the panel's error state): a rejection
// reaching the browser before <Await> renders would be unhandled there and
// carry the driver's error. The real error is logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName } = access;
  const projects = clientProjects.listProjects(clientId).catch((error) => {
    console.error(
      `client: couldn't load the Overview Projects (${describeError(error)})`,
      { clientId },
    );
    return null;
  });
  // One more than shown, so the panel knows whether to offer "View all".
  const recentRequests = requests
    .listRequests(clientId, { limit: OVERVIEW_REQUEST_LIMIT + 1 })
    .catch((error) => {
      console.error(
        `client: couldn't load the Overview Requests (${describeError(error)})`,
        { clientId },
      );
      return null;
    });
  const projectOptions = await loadProjectOptions(clientId);
  return data(
    { clientName, projects, requests: recentRequests, projectOptions },
    { headers },
  );
}

async function loadProjectOptions(clientId: string): Promise<ProjectOption[]> {
  let options: ProjectOption[] = [];
  try {
    options = await requests.listProjectOptions(clientId);
  } catch (error) {
    console.error(
      `client: couldn't load the Request project options (${describeError(error)})`,
      { clientId },
    );
  }
  return options;
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return <ClientRouteError title="Overview" />;
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isRequestDrawerToggle(args);
}

export default function ClientOverviewPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const { highlightedId, highlight } = useRowHighlight(null);
  const headerLinkRef = useRef<HTMLAnchorElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const isDrawerOpen =
    searchParams.get(NEW_REQUEST_PARAM) === NEW_REQUEST_VALUE;

  const closeDrawer = useCallback((): void => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_REQUEST_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  const handleSaved = useCallback(
    (requestId: string): void => {
      closeDrawer();
      toast(REQUEST_COPY.submitted);
      highlight(requestId);
    },
    [closeDrawer, highlight],
  );

  function handleOpenChange(open: boolean): void {
    if (!open) closeDrawer();
  }

  function handleOpenDrawer(event: React.MouseEvent<HTMLElement>): void {
    openerRef.current = event.currentTarget;
  }

  // Back to the trigger that opened the drawer; the empty state's button goes
  // away once the first Request lands, so then the header's takes over.
  function getReturnFocusTarget(): HTMLElement | null {
    const opener = openerRef.current;
    return opener?.isConnected ? opener : headerLinkRef.current;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: loaderData.clientName, isTruncated: true },
          { label: "Overview" },
        ]}
        title="Overview"
        action={
          <NewRequestLink ref={headerLinkRef} onClick={handleOpenDrawer} />
        }
      />
      <OverviewKpis projects={loaderData.projects} />
      <ProjectsPanel projects={loaderData.projects} titleHref={PROJECTS_PATH} />
      {/* A grid so Phase 7 can put Invoices beside the Requests at xl. */}
      <div className="grid grid-cols-1 gap-4">
        <RequestsPanel
          requests={loaderData.requests}
          highlightedId={highlightedId}
          onOpenDrawer={handleOpenDrawer}
        />
      </div>
      <RequestDrawer
        open={isDrawerOpen}
        onOpenChange={handleOpenChange}
        mode="new"
        initial={EMPTY_REQUEST}
        projectOptions={loaderData.projectOptions}
        clientName={loaderData.clientName}
        action={SUBMIT_REQUEST_ACTION}
        onSaved={handleSaved}
        getReturnFocusTarget={getReturnFocusTarget}
      />
    </div>
  );
}
