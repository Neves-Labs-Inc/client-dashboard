import { UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import InviteOwnerDrawer from "@/components/admin/invite-owner-drawer";
import PendingInvitationsPanel from "@/components/admin/pending-invitations-panel";
import TeamMembersPanel from "@/components/admin/team-members-panel";
import Button from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import TabNav from "@/components/ui/tab-nav";
import { useTeamInvitations } from "@/hooks/use-team-invitations";
import type { Team } from "@/lib/auth/auth";
import { clearHistoryState } from "@/lib/history-state";
import { getCreatedClientId, getTeamPath } from "@/lib/new-client";

export const CLIENTS_CRUMB = { label: "Clients", href: "/admin" };

type TeamViewProps = {
  team: Team;
};

export default function TeamView({ team }: TeamViewProps): React.ReactNode {
  const { state } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isJustCreated = getCreatedClientId(state) === team.clientId;
  const invitations = useTeamInvitations(team);

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
        items={[
          { label: "Team", to: getTeamPath(team.clientId), current: true },
        ]}
      />
      <TeamMembersPanel members={team.members} />
      <PendingInvitationsPanel
        clientId={team.clientId}
        invitations={team.pendingInvitations}
        highlightedId={invitations.highlightedId}
        notice={invitations.notice}
        onNotice={invitations.handleNotice}
        onRowGone={invitations.handleRowGone}
        titleRef={invitations.pendingTitleRef}
      />
      <InviteOwnerDrawer
        open={invitations.isInviteOpen}
        onOpenChange={invitations.handleInviteOpenChange}
        clientId={team.clientId}
        clientName={team.name}
        onSent={invitations.handleSent}
        getReturnFocusTarget={invitations.getDrawerReturnFocus}
      />
    </>
  );
}
