import { useState } from "react";
import InvitationRow, {
  INVITATION_TABLE_GRID_CLASS,
} from "@/components/team/invitation-row";
import DataTable from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import StatusIcon from "@/components/ui/status-icon";
import type { PendingInvitation } from "@/lib/auth/auth";
import type { InvitationRowCopy } from "@/lib/team-invitations";

const COLUMNS = [
  { header: "Email" },
  { header: "Sent", align: "end" as const },
  { header: "Actions", isLabelHidden: true },
];

type PendingInvitationsPanelProps = {
  // The route the rows' resend and revoke post to.
  action: string;
  copy: InvitationRowCopy;
  invitations: PendingInvitation[];
  // The row just sent, which gets the highlight fade.
  highlightedId: string | null;
  // A failed or stale resend or revoke, under the header.
  notice: string | null;
  onNotice: (message: string | null) => void;
  onRowGone: (invitationId: string) => void;
  titleRef: React.Ref<HTMLHeadingElement>;
};

export default function PendingInvitationsPanel({
  action,
  copy,
  invitations,
  highlightedId,
  notice,
  onNotice,
  onRowGone,
  titleRef,
}: PendingInvitationsPanelProps): React.ReactNode {
  // One row confirms a revoke at a time; opening another closes the first.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <Panel
      title="Pending invitations"
      titleRef={titleRef}
      meta={invitations.length > 0 ? invitations.length : undefined}
    >
      {notice && (
        <div
          role="alert"
          className="flex items-start gap-1.5 border-b border-line px-3 py-2 text-[13px]/5 text-fg"
        >
          <StatusIcon status="off" className="mt-1" />
          <p>{notice}</p>
        </div>
      )}
      {invitations.length === 0 ? (
        <EmptyState>No pending invitations.</EmptyState>
      ) : (
        <DataTable
          label="Pending invitations"
          columns={COLUMNS}
          gridClassName={INVITATION_TABLE_GRID_CLASS}
          isSubgrid
        >
          {invitations.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              action={action}
              copy={copy}
              isHighlighted={invitation.id === highlightedId}
              isConfirming={invitation.id === confirmingId}
              onConfirmingChange={(isConfirming) =>
                setConfirmingId((current) =>
                  getConfirmingId(current, invitation.id, isConfirming),
                )
              }
              onNotice={onNotice}
              onRowGone={onRowGone}
            />
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

// A row closing its confirm leaves another row's open one alone.
function getConfirmingId(
  current: string | null,
  rowId: string,
  isConfirming: boolean,
): string | null {
  if (isConfirming) return rowId;

  return current === rowId ? null : current;
}
