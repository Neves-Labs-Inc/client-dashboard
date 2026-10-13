import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import type { PendingInvitation } from "@/lib/auth/auth";

type PendingInvitationsPanelProps = {
  invitations: PendingInvitation[];
};

// Ticket 07 adds the invitation rows and their actions.
export default function PendingInvitationsPanel({
  invitations,
}: PendingInvitationsPanelProps): React.ReactNode {
  return (
    <Panel title="Pending invitations">
      {invitations.length === 0 && (
        <EmptyState>No pending invitations.</EmptyState>
      )}
    </Panel>
  );
}
