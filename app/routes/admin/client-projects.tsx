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
import { INTENT_FIELD } from "@/lib/link-board";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  PROJECT_ID_FIELD,
  PROJECTS_COPY,
  SYNC_NOW_INTENT,
  type SyncNowOutcome,
} from "@/lib/projects";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-projects";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

type OutcomeResponse = ReturnType<typeof data<SyncNowOutcome>>;

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
  const [client, projects] = await Promise.all([
    loadClient(params.clientId),
    loadProjects(params.clientId),
  ]);
  if (client === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(
    { client, projects, isGithubConnected: boardSync.isGithubConnected },
    { headers },
  );
}

// Sync now posts here. The guard comes first, before the body is read: it
// is the only CSRF protection.
export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const intent = readField(form, INTENT_FIELD);
  if (intent !== SYNC_NOW_INTENT) {
    console.warn("admin: refused an unknown Projects action");
    return data<SyncNowOutcome>(
      { kind: "failed" },
      { status: BAD_REQUEST, headers },
    );
  }

  const projectId = readField(form, PROJECT_ID_FIELD);
  try {
    const answer = await syncClientProject(params.clientId, projectId);
    return data(answer.outcome, { status: answer.status, headers });
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(`admin: Sync now failed (${describeError(error)})`, {
      clientId: params.clientId,
      projectId,
    });
    return data<SyncNowOutcome>(
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
}: Route.ClientActionArgs): Promise<SyncNowOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "synced") return outcome;

    const status = outcome.kind === "failed" ? SERVER_ERROR : UNPROCESSABLE;
    return data(outcome, { status });
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("admin: the Sync now request failed", error);
    return data<SyncNowOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

function readField(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

type SyncAnswer = { outcome: SyncNowOutcome; status: number };

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
  const { client, projects, isGithubConnected } = loaderData;
  if (client === null) return <ProjectsError />;

  // Keyed, so another Client's tab starts with fresh row state.
  return (
    <ProjectsView
      key={client.clientId}
      client={client}
      projects={projects}
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
