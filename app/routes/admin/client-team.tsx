import { useEffect, useRef } from "react";
import {
  data,
  useLocation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import PendingInvitationsPanel from "@/components/admin/pending-invitations-panel";
import TeamMembersPanel from "@/components/admin/team-members-panel";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import TabNav from "@/components/ui/tab-nav";
import { auth } from "@/lib/auth/auth.server";
import type { Team } from "@/lib/auth/auth";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { getCreatedClientId, getTeamPath } from "@/lib/new-client";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-team";

const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;
const CLIENTS_CRUMB = { label: "Clients", href: "/admin" };

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.team?.name;
  const title = name ? `${name} · Team` : "Team";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Awaited, not streamed: an unknown Client must be a 404, and the admin
// layout shows the skeleton during client-side navigation. A failed load
// resolves to null (the page's error state) instead of throwing, so the
// shell stays and the real error is logged here only.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const team = await loadTeam(params.clientId);
  if (team === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data({ team }, { headers });
}

export async function action({ request }: Route.ActionArgs): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw data(null, { status: METHOD_NOT_ALLOWED, headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

async function loadTeam(clientId: string): Promise<Team | "not-found" | null> {
  try {
    const team = await auth.getTeam(clientId);
    return team ?? "not-found";
  } catch (error) {
    console.error("admin: couldn't load the team", { clientId, error });
    return null;
  }
}

export default function ClientTeam({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { team } = loaderData;
  if (team === null) return <TeamError />;

  return <TeamView team={team} />;
}

function TeamView({ team }: { team: Team }): React.ReactNode {
  const { state } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isJustCreated = getCreatedClientId(state) === team.clientId;

  // Arriving from create, the drawer's trigger may be gone: focus the h1.
  useEffect(() => {
    if (!isJustCreated) return;

    titleRef.current?.focus();
    clearCreatedClientState();
  }, [isJustCreated, team.clientId]);

  return (
    <>
      <PageHeader
        breadcrumb={[CLIENTS_CRUMB, { label: team.name }]}
        title={team.name}
        titleRef={titleRef}
      />
      <TabNav
        label="Client sections"
        items={[
          { label: "Team", to: getTeamPath(team.clientId), current: true },
        ]}
      />
      <TeamMembersPanel members={team.members} />
      <PendingInvitationsPanel invitations={team.pendingInvitations} />
    </>
  );
}

// Drops the "just created" marker from this history entry, so a reload or
// Back/Forward doesn't replay the focus and highlight. Through the History
// API, not navigate(): that would rerun the loaders. React Router keeps the
// location state under `usr`; the in-memory location (and the highlight
// already running) is unaffected.
function clearCreatedClientState(): void {
  const current: unknown = window.history.state;
  const next =
    typeof current === "object" && current !== null
      ? { ...current, usr: null }
      : current;
  window.history.replaceState(next, "");
}

function TeamError(): React.ReactNode {
  return (
    <>
      <PageHeader breadcrumb={[CLIENTS_CRUMB]} title="Team" />
      <Panel title="Team">
        <PanelError message="Couldn't load the team." />
      </Panel>
    </>
  );
}
