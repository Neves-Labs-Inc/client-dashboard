import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import ProjectsView from "@/components/admin/projects-view";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { auth } from "@/lib/auth/auth.server";
import {
  requireAdmin,
  requireAdminMutation,
} from "@/lib/auth/require-access.server";
import type { ProjectRow } from "@/lib/board-sync/board-sync";
import { boardSync } from "@/lib/board-sync/board-sync.server";
import { describeError } from "@/lib/describe-error";
import { INTENT_FIELD, parseMapping } from "@/lib/link-board";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  isMapDrawerClose,
  MAP_PARAM,
  PROJECT_ID_FIELD,
  PROJECTS_COPY,
  SAVE_MAPPING_INTENT,
  SYNC_NOW_INTENT,
  type MapLoad,
  type SaveMappingOutcome,
  type SyncNowOutcome,
} from "@/lib/projects";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-projects";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

// Sync now and Save mapping post here; both answer in the same shapes.
type ProjectsOutcome = SyncNowOutcome | SaveMappingOutcome;
type OutcomeResponse = ReturnType<typeof data<ProjectsOutcome>>;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.client?.name;
  const title = name ? `${name} · Projects` : "Projects";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Awaited, not streamed: an unknown Client must be a 404, and the admin
// layout shows the skeleton during client-side navigation. A failed load
// resolves to null (the page's error state) instead of throwing, so the
// shell stays and the real error is logged here only.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const mapProjectId = new URL(request.url).searchParams.get(MAP_PARAM);
  const [client, projects, mapping] = await Promise.all([
    loadClient(params.clientId),
    loadProjects(params.clientId),
    loadMapping(params.clientId, mapProjectId),
  ]);
  if (client === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(
    {
      client,
      projects,
      mapping,
      isGithubConnected: boardSync.isGithubConnected,
    },
    { headers },
  );
}

// Sync now and Save mapping post here. The guard comes first, before the
// body is read: it is the only CSRF protection.
export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const intent = readField(form, INTENT_FIELD);
  if (intent !== SYNC_NOW_INTENT && intent !== SAVE_MAPPING_INTENT) {
    console.warn("admin: refused an unknown Projects action");
    return data<ProjectsOutcome>(
      { kind: "failed" },
      { status: BAD_REQUEST, headers },
    );
  }

  const projectId = readField(form, PROJECT_ID_FIELD);
  try {
    const answer =
      intent === SYNC_NOW_INTENT
        ? await syncClientProject(params.clientId, projectId)
        : await saveClientMapping(params.clientId, projectId, form);
    return data(answer.outcome, { status: answer.status, headers });
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(`admin: ${intent} failed (${describeError(error)})`, {
      clientId: params.clientId,
      projectId,
    });
    return data<ProjectsOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}

// A network failure (or a crash) becomes the row's alert instead of the
// route's error page; the guard's redirects still go through. Anything but
// a success carries a 4xx/5xx status, so no loader revalidates: offline, a
// revalidation would throw the page to the root error boundary.
export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<ProjectsOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "synced" || outcome.kind === "saved") return outcome;

    const status = outcome.kind === "failed" ? SERVER_ERROR : UNPROCESSABLE;
    return data(outcome, { status });
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("admin: the Projects request failed", error);
    return data<ProjectsOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  // Closing the drawer changes nothing it loaded; opening must load.
  return revalidateUnlessThemeFailed(args) && !isMapDrawerClose(args);
}

function readField(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

type SyncAnswer = { outcome: SyncNowOutcome; status: number };
type SaveAnswer = { outcome: SaveMappingOutcome; status: number };

// Saves the mapping only if the Project is this Client's (the URL's), as
// Sync now does.
async function saveClientMapping(
  clientId: string,
  projectId: string,
  form: FormData | null,
): Promise<SaveAnswer> {
  const mapping = parseMapping(form);
  if (mapping === null) {
    console.warn("admin: refused a malformed mapping", { projectId });
    return { outcome: { kind: "failed" }, status: BAD_REQUEST };
  }
  if (!(await hasProject(clientId, projectId))) {
    console.warn("admin: refused a mapping of another Client's Project", {
      clientId,
      projectId,
    });
    return {
      outcome: { kind: "refused", error: "not-found" },
      status: NOT_FOUND,
    };
  }

  const result = await boardSync.saveMapping(projectId, mapping);
  const outcome: SaveMappingOutcome =
    result.error === null
      ? { kind: "saved" }
      : { kind: "refused", error: result.error };
  return { outcome, status: result.status };
}

// Syncs the Project only if it is this Client's (the URL's), so a post can't
// reach another Client's board from here.
async function syncClientProject(
  clientId: string,
  projectId: string,
): Promise<SyncAnswer> {
  if (!(await hasProject(clientId, projectId))) {
    console.warn("admin: refused Sync now of another Client's Project", {
      clientId,
      projectId,
    });
    return {
      outcome: { kind: "refused", error: "not-found", message: null },
      status: NOT_FOUND,
    };
  }

  const result = await boardSync.syncNow(projectId);
  let outcome: SyncNowOutcome = { kind: "synced" };
  if (result.error !== null) {
    const message =
      result.error === "sync-failed"
        ? await getRecordedError(clientId, projectId)
        : null;
    outcome = { kind: "refused", error: result.error, message };
  }
  return { outcome, status: result.status };
}

async function hasProject(
  clientId: string,
  projectId: string,
): Promise<boolean> {
  const projects = await boardSync.listProjects(clientId);
  return projects.some((row) => row.id === projectId);
}

// The message the failed sync recorded on the Project, for the row's alert.
async function getRecordedError(
  clientId: string,
  projectId: string,
): Promise<string | null> {
  const projects = await boardSync.listProjects(clientId);
  return projects.find((row) => row.id === projectId)?.lastSyncError ?? null;
}

// The mapping for `?map=`, only for a Project of this Client; no param, no
// load. A failed load is "failed" so the drawer can say so.
async function loadMapping(
  clientId: string,
  projectId: string | null,
): Promise<MapLoad | null> {
  if (projectId === null) return null;

  let mapping: MapLoad["mapping"] = null;
  try {
    if (await hasProject(clientId, projectId)) {
      mapping = await boardSync.getMapping(projectId);
    }
  } catch (error) {
    console.error(
      `admin: couldn't load the mapping (${describeError(error)})`,
      { clientId, projectId },
    );
    mapping = "failed";
  }
  return { projectId, mapping };
}

async function loadClient(
  clientId: string,
): Promise<ClientWorkspace | "not-found" | null> {
  try {
    const team = await auth.getTeam(clientId);
    return team === null
      ? "not-found"
      : {
          clientId: team.clientId,
          name: team.name,
          archivedAt: team.archivedAt,
        };
  } catch (error) {
    console.error("admin: couldn't load the Client", { clientId, error });
    return null;
  }
}

async function loadProjects(clientId: string): Promise<ProjectRow[] | null> {
  try {
    return await boardSync.listProjects(clientId);
  } catch (error) {
    console.error(
      `admin: couldn't load the Projects (${describeError(error)})`,
      { clientId },
    );
    return null;
  }
}

export default function ClientProjects({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { client, projects, mapping, isGithubConnected } = loaderData;
  if (client === null) return <ProjectsError />;

  // Keyed, so another Client's tab starts with fresh row state.
  return (
    <ProjectsView
      key={client.clientId}
      client={client}
      projects={projects}
      mapLoad={mapping}
      isGithubConnected={isGithubConnected}
    />
  );
}

function ProjectsError(): React.ReactNode {
  return (
    <>
      <PageHeader breadcrumb={[CLIENTS_CRUMB]} title="Projects & boards" />
      <Panel title="Projects">
        <PanelError message={PROJECTS_COPY.loadFailed} />
      </Panel>
    </>
  );
}
