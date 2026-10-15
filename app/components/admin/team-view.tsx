import { UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import ClientWorkspaceHeader from "@/components/admin/client-workspace-header";
import TeamMembersPanel from "@/components/team/team-members-panel";
import InviteDrawer from "@/components/team/invite-drawer";
import PendingInvitationsPanel from "@/components/team/pending-invitations-panel";
import Button from "@/components/ui/button";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useTeamInvitations } from "@/hooks/use-team-invitations";
import type { Team } from "@/lib/auth/auth";
import { clearHistoryState } from "@/lib/history-state";
import { getCreatedClientId, getTeamPath } from "@/lib/new-client";
import {
  ADMIN_INVITATION_ROW_COPY,
  getInviteFeedback,
} from "@/lib/team-invitations";

type TeamViewProps = {
  team: Team;
};

export default function TeamView({ team }: TeamViewProps): React.ReactNode {
  const { state } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isJustCreated = getCreatedClientId(state) === team.clientId;
  const invitations = useTeamInvitations(team, { canReturnToInvite: true });
  const teamPath = getTeamPath(team.clientId);
  const archive = useArchiveClient({
    clientName: team.name,
    action: teamPath,
    titleRef,
  });
  const isArchived = team.archivedAt !== null;

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
      <ClientWorkspaceHeader
        client={team}
        tab="team"
        archive={archive}
        titleRef={titleRef}
      >
        {team.canInviteFirstOwner && (
          <Button
            ref={invitations.inviteButtonRef}
            variant="primary"
            icon={UserPlus}
            className="whitespace-nowrap"
            disabled={archive.isBusy}
            onClick={() => invitations.handleInviteOpenChange(true)}
          >
            Invite first Owner
          </Button>
        )}
      </ClientWorkspaceHeader>
      {/* The Admin has no own row: every row has actions. An archived
          Client's rows keep only "Remove". */}
      <TeamMembersPanel
        members={team.members}
        clientName={team.name}
        canManage
        canChangeRoles={!isArchived}
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
