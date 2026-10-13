import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import TeamMembersPanel from "@/components/admin/team-members-panel";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import type {
  ClientAccess,
  PendingInvitation,
  TeamMember,
} from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/team";

// What the page gets: Members never receive the pending invitations.
type ClientTeam = {
  // Oldest first.
  members: TeamMember[];
  pendingInvitations?: PendingInvitation[];
};

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.clientName;
  const title = clientName ? `Team · ${clientName}` : "Team";
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client, never by the URL. A failed load
// resolves to null (the page's error state) instead of throwing, so the
// shell stays and the real error is logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const team = await loadTeam(access);
  return data({ clientName: access.clientName, team }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

async function loadTeam(access: ClientAccess): Promise<ClientTeam | null> {
  const { clientId, role } = access;
  let clientTeam: ClientTeam | null = null;
  try {
    const team = await auth.getTeam(clientId);
    if (team === null) {
      console.error("client: the session's Client has no team", { clientId });
    } else {
      const { members, pendingInvitations } = team;
      clientTeam =
        role === "owner" ? { members, pendingInvitations } : { members };
    }
  } catch (error) {
    console.error("client: couldn't load the team", { clientId, error });
  }
  return clientTeam;
}

export default function ClientTeamPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { clientName, team } = loaderData;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: clientName, isTruncated: true },
          { label: "Team" },
        ]}
        title="Team"
      />
      {team === null ? (
        <Panel title="Users">
          <PanelError message="Couldn't load the team." />
        </Panel>
      ) : (
        <TeamMembersPanel members={team.members} />
      )}
    </>
  );
}
