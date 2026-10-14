import { useCallback, useEffect, useRef, useState } from "react";
import MemberRow, {
  ACTIONS_HEADER_CLASS,
  MANAGED_TABLE_GRID_CLASS,
  TABLE_GRID_CLASS,
  type MemberRowVariant,
} from "@/components/team/member-row";
import PanelNotice from "@/components/team/panel-notice";
import { getConfirmingId } from "@/components/team/pending-invitations-panel";
import DataTable from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import type { TeamMember } from "@/lib/auth/auth";

const COLUMNS = [{ header: "Name" }, { header: "Email" }, { header: "Role" }];
const MANAGED_COLUMNS = [
  ...COLUMNS,
  { header: "Actions", isLabelHidden: true, className: ACTIONS_HEADER_CLASS },
];

type TeamMembersPanelProps = {
  // Oldest first.
  members: TeamMember[];
  clientName: string;
  // The Admin's or an Owner's view: role changes and removes on every row
  // but the viewer's own.
  canManage: boolean;
  // False on an archived Client: its managed rows offer only "Remove".
  canChangeRoles?: boolean;
  // The viewer's own row, which has no actions; null for the Admin.
  viewerUserId: string | null;
  // The route the rows' actions post to.
  action: string;
  // Focused after a remove instead of the Users heading when it's there
  // (the Admin's "Invite first Owner", back once the Client is empty).
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

// The Users panel of a Client's Team, for the Admin and the client area.
export default function TeamMembersPanel({
  members,
  clientName,
  canManage,
  canChangeRoles = true,
  viewerUserId,
  action,
  returnFocusRef,
}: TeamMembersPanelProps): React.ReactNode {
  const roster = useRosterPanel(members, returnFocusRef);

  return (
    <Panel title="Users" titleRef={canManage ? roster.titleRef : undefined}>
      {roster.notice && <PanelNotice>{roster.notice}</PanelNotice>}
      {members.length === 0 ? (
        <EmptyState>No users yet.</EmptyState>
      ) : (
        <DataTable
          label="Users"
          columns={canManage ? MANAGED_COLUMNS : COLUMNS}
          gridClassName={
            canManage ? MANAGED_TABLE_GRID_CLASS : TABLE_GRID_CLASS
          }
          isSubgrid={canManage}
        >
          {members.map((teamMember) => (
            <MemberRow
              key={teamMember.userId}
              member={teamMember}
              variant={getVariant(canManage, teamMember.userId, viewerUserId)}
              clientName={clientName}
              canChangeRole={canChangeRoles}
              action={action}
              isHighlighted={teamMember.userId === roster.highlightedId}
              isConfirming={teamMember.userId === roster.confirmingId}
              onConfirmingChange={(isConfirming) =>
                roster.handleConfirmingChange(teamMember.userId, isConfirming)
              }
              onNotice={roster.handleNotice}
              onRoleChanged={roster.handleRoleChanged}
              onRowGone={roster.handleRowGone}
            />
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

function getVariant(
  canManage: boolean,
  userId: string,
  viewerUserId: string | null,
): MemberRowVariant {
  if (!canManage) return "read-only";

  return userId === viewerUserId ? "self" : "managed";
}

// The panel's own state: its notice (apart from the Pending panel's), the
// one open confirm, the highlight after a role change, and where focus
// lands once a removed row is gone.
function useRosterPanel(
  members: TeamMember[],
  returnFocusRef: React.RefObject<HTMLElement | null> | undefined,
) {
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [goneId, setGoneId] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const frameRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Once the page has revalidated without the row: the returned invite
  // action when there is one, else the Users heading.
  useEffect(() => {
    if (goneId === null) return;
    if (members.some(({ userId }) => userId === goneId)) return;

    (returnFocusRef?.current ?? titleRef.current)?.focus();
    setGoneId(null);
  }, [goneId, members, returnFocusRef]);

  // Stable: the row hooks list these in their effects' deps.
  const handleRoleChanged = useCallback((userId: string): void => {
    // Cleared for two frames first, so a repeat change on the same row
    // replays the fade.
    setHighlightedId(null);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => setHighlightedId(userId));
    });
  }, []);

  const handleRowGone = useCallback((userId: string): void => {
    setGoneId(userId);
  }, []);

  const handleConfirmingChange = useCallback(
    (userId: string, isConfirming: boolean): void => {
      setConfirmingId((current) =>
        getConfirmingId(current, userId, isConfirming),
      );
    },
    [],
  );

  return {
    notice,
    handleNotice: setNotice,
    confirmingId,
    handleConfirmingChange,
    highlightedId,
    handleRoleChanged,
    handleRowGone,
    titleRef,
  };
}
