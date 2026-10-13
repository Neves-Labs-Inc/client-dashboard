import { UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import TeamMembersPanel from "@/components/team/team-members-panel";
import InviteDrawer from "@/components/team/invite-drawer";
import PendingInvitationsPanel from "@/components/team/pending-invitations-panel";
import Button from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import TabNav from "@/components/ui/tab-nav";
import { useTeamInvitations } from "@/hooks/use-team-invitations";
import type { Team } from "@/lib/auth/auth";
import { clearHistoryState } from "@/lib/history-state";
import { getCreatedClientId, getTeamPath } from "@/lib/new-client";
import {
  ADMIN_INVITATION_ROW_COPY,
  getInviteFeedback,
} from "@/lib/team-invitations";

export const CLIENTS_CRUMB = { label: "Clients", href: "/admin" };

type TeamViewProps = {
  team: Team;
};

export default function TeamView({ team }: TeamViewProps): React.ReactNode {
  const { state } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isJustCreated = getCreatedClientId(state) === team.clientId;
  const invitations = useTeamInvitations(team, { canReturnToInvite: true });
  const teamPath = getTeamPath(team.clientId);

  // Arriving from create, the drawer's trigger may be gone: focus the h1
  // (the invite drawer, when it opens, takes focus from there). The marker
  // leaves the history entry, so a reload doesn't replay it.
  useEffect(() => {
    if (!isJustCreated) return;

    titleRef.current?.focus();
    clearHistoryState();
  }, [isJustCreated, team.clientId]);

  return (
    <>
      <PageHeader
        breadcrumb={[CLIENTS_CRUMB, { label: team.name }]}
        title={team.name}
        titleRef={titleRef}
        action={
          team.canInviteFirstOwner && (
            <Button
              ref={invitations.inviteButtonRef}
              variant="primary"
              icon={UserPlus}
              onClick={() => invitations.handleInviteOpenChange(true)}
            >
              Invite first Owner
            </Button>
          )
        }
      />
      <TabNav
        label="Client sections"
        items={[{ label: "Team", to: teamPath, current: true }]}
      />
      {/* The Admin has no own row: every row has actions. */}
      <TeamMembersPanel
        members={team.members}
        clientName={team.name}
        canManage
        viewerUserId={null}
        action={teamPath}
        returnFocusRef={invitations.inviteButtonRef}
      />
      <PendingInvitationsPanel
        action={teamPath}
        copy={ADMIN_INVITATION_ROW_COPY}
        invitations={team.pendingInvitations}
        highlightedId={invitations.highlightedId}
        notice={invitations.notice}
        onNotice={invitations.handleNotice}
        onRowGone={invitations.handleRowGone}
        titleRef={invitations.pendingTitleRef}
      />
      <InviteDrawer
        open={invitations.isInviteOpen}
        onOpenChange={invitations.handleInviteOpenChange}
        title="Invite first Owner"
        help={`They'll join ${team.name} as its Owner. The invitation expires in 7 days.`}
        action={teamPath}
        getFeedback={getInviteFeedback}
        onSent={invitations.handleSent}
        getReturnFocusTarget={invitations.getDrawerReturnFocus}
      />
    </>
  );
}
