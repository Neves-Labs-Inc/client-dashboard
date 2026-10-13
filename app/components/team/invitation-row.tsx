import { useId } from "react";
import Button from "@/components/ui/button";
import { SUBGRID_ROW_CLASS } from "@/components/ui/data-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import { useInvitationRow } from "@/hooks/use-invitation-row";
import type { PendingInvitation } from "@/lib/auth/auth";
import type { InvitationRowCopy } from "@/lib/team-invitations";

// The table's tracks from md (the rows are subgrids of it). Below md: email
// over "Sent", then the actions, each on its own line.
export const INVITATION_TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(0,1fr)_96px_auto]";
const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)] gap-y-2 md:gap-3 ${SUBGRID_ROW_CLASS}`;

type InvitationRowProps = {
  invitation: PendingInvitation;
  // The route the row's resend and revoke post to.
  action: string;
  copy: InvitationRowCopy;
  isHighlighted: boolean;
  isConfirming: boolean;
  onConfirmingChange: (isConfirming: boolean) => void;
  onNotice: (message: string | null) => void;
  onRowGone: (invitationId: string) => void;
};

export default function InvitationRow({
  invitation,
  action,
  copy,
  isHighlighted,
  isConfirming,
  onConfirmingChange,
  onNotice,
  onRowGone,
}: InvitationRowProps): React.ReactNode {
  const promptId = useId();
  const row = useInvitationRow({
    invitationId: invitation.id,
    action,
    copy,
    isConfirming,
    onConfirmingChange,
    onNotice,
    onRowGone,
  });

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isHighlighted={isHighlighted}>
      {/* The only place the full address shows, so it wraps until xl, where
          the column fits real addresses even with a confirm open. */}
      <DataTableCell className="text-[13px]/5 wrap-anywhere text-fg xl:truncate">
        <span title={invitation.email}>{invitation.email}</span>
      </DataTableCell>
      <DataTableCell className="font-mono text-xs/4 text-fg-2 md:text-right md:text-[13px]/5">
        <span className="md:hidden">Sent </span>
        <DateText date={invitation.sentAt} />
      </DataTableCell>
      {/* Capped between md and lg, so the confirm wraps (prompt over its
          buttons) instead of squeezing the email column. */}
      <DataTableCell className="md:max-w-52 lg:max-w-none">
        {isConfirming ? (
          <div
            role="group"
            aria-labelledby={promptId}
            onKeyDown={row.handleConfirmKeyDown}
            className="flex animate-in flex-wrap items-center gap-2 duration-(--dur-base) ease-out fade-in-0 md:justify-end lg:flex-nowrap"
          >
            <p
              id={promptId}
              className="w-full text-[13px]/5 text-fg md:text-right lg:w-auto lg:text-left lg:whitespace-nowrap"
            >
              Revoke this invitation?
            </p>
            <Button
              variant="destructive"
              isPending={row.isRevoking}
              pendingLabel="Revoking…"
              onClick={row.handleRevoke}
            >
              Revoke
            </Button>
            <Button
              autoFocus
              disabled={row.isRevoking}
              onClick={row.handleKeep}
            >
              Keep
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 md:justify-end">
            <Button
              isPending={row.isResending}
              pendingLabel="Resending…"
              onClick={row.handleResend}
            >
              Resend
            </Button>
            <Button
              ref={row.revokeRef}
              variant="destructive"
              disabled={row.isResending}
              onClick={row.handleStartRevoke}
            >
              Revoke
            </Button>
          </div>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}
