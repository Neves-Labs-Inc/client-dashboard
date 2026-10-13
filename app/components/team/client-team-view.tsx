import { UserPlus } from "lucide-react";
import TeamMembersPanel from "@/components/admin/team-members-panel";
import InviteDrawer from "@/components/team/invite-drawer";
import PendingInvitationsPanel from "@/components/team/pending-invitations-panel";
import Button from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useTeamInvitations } from "@/hooks/use-team-invitations";
import type { PendingInvitation, TeamMember } from "@/lib/auth/auth";
import {
  getMemberInviteFeedback,
  MEMBER_INVITATION_COPY,
} from "@/lib/team-invitations";

// The client /team page's post target.
const TEAM_ACTION = "/team";
const NO_INVITATIONS: PendingInvitation[] = [];

// What the page gets: Members never receive the pending invitations.
export type ClientTeam = {
  // Oldest first.
  members: TeamMember[];
  pendingInvitations?: PendingInvitation[];
};

type ClientTeamViewProps = {
  clientName: string;
  role: "owner" | "member";
  // Null when it couldn't load.
  team: ClientTeam | null;
};

// The client Team page: the roster for everyone; for Owners, also the
// invite action, its drawer and the Pending invitations panel.
export default function ClientTeamView({
  clientName,
  role,
  team,
}: ClientTeamViewProps): React.ReactNode {
  return role === "owner" ? (
    <OwnerTeam clientName={clientName} team={team} />
  ) : (
    <>
      <TeamHeader clientName={clientName} />
      <MembersOrError team={team} />
    </>
  );
}

function OwnerTeam({
  clientName,
  team,
}: Omit<ClientTeamViewProps, "role">): React.ReactNode {
  const pendingInvitations = team?.pendingInvitations ?? NO_INVITATIONS;
  const invitations = useTeamInvitations(
    { clientId: null, canInviteFirstOwner: false, pendingInvitations },
    { canReturnToInvite: false },
  );

  return (
    <>
      <TeamHeader
        clientName={clientName}
        action={
          <Button
            ref={invitations.inviteButtonRef}
            variant="primary"
            icon={UserPlus}
            onClick={() => invitations.handleInviteOpenChange(true)}
          >
            Invite teammate
          </Button>
        }
      />
      <MembersOrError team={team} />
      {team !== null && (
        <PendingInvitationsPanel
          action={TEAM_ACTION}
          copy={MEMBER_INVITATION_COPY}
          invitations={pendingInvitations}
          highlightedId={invitations.highlightedId}
          notice={invitations.notice}
          onNotice={invitations.handleNotice}
          onRowGone={invitations.handleRowGone}
          titleRef={invitations.pendingTitleRef}
        />
      )}
      {/* Works while the team can't load: a send revalidates the page. */}
      <InviteDrawer
        open={invitations.isInviteOpen}
        onOpenChange={invitations.handleInviteOpenChange}
        title="Invite teammate"
        help={`They'll join ${clientName} as a Member. The invitation expires in 7 days.`}
        action={TEAM_ACTION}
        getFeedback={getMemberInviteFeedback}
        onSent={invitations.handleSent}
        getReturnFocusTarget={invitations.getDrawerReturnFocus}
      />
    </>
  );
}

function TeamHeader({
  clientName,
  action,
}: {
  clientName: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <PageHeader
      breadcrumb={[{ label: clientName, isTruncated: true }, { label: "Team" }]}
      title="Team"
      action={action}
    />
  );
}

// A failed load shows one error in place of both panels.
function MembersOrError({
  team,
}: {
  team: ClientTeam | null;
}): React.ReactNode {
  return team === null ? (
    <Panel title="Users">
      <PanelError message="Couldn't load the team." />
    </Panel>
  ) : (
    <TeamMembersPanel members={team.members} />
  );
}
