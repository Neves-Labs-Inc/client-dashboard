import DataTable from "@/components/ui/data-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import type { TeamMember } from "@/lib/auth/auth";

const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(140px,1fr)_minmax(180px,1.4fr)_96px]";
// Below md: name over email on the left, role on the right across both lines.
const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-3 ${TABLE_GRID_CLASS}`;
const COLUMNS = [{ header: "Name" }, { header: "Email" }, { header: "Role" }];
const ROLE_LABEL: Record<TeamMember["role"], string> = {
  owner: "Owner",
  member: "Member",
};

type TeamMembersPanelProps = {
  members: TeamMember[];
};

// Phase 2 has no members yet (they arrive in Phase 3), so the empty state is
// what shows; the rows carry no controls.
export default function TeamMembersPanel({
  members,
}: TeamMembersPanelProps): React.ReactNode {
  return (
    <Panel title="Users">
      {members.length === 0 ? (
        <EmptyState>No users yet.</EmptyState>
      ) : (
        <DataTable
          label="Users"
          columns={COLUMNS}
          gridClassName={TABLE_GRID_CLASS}
        >
          {members.map((teamMember) => (
            <DataTableRow
              key={teamMember.userId}
              gridClassName={ROW_GRID_CLASS}
            >
              <DataTableCell className="col-start-1 row-start-1 truncate text-[13px]/5 font-medium text-fg md:col-auto md:row-auto">
                {teamMember.name}
              </DataTableCell>
              <DataTableCell className="col-start-1 row-start-2 truncate text-[13px]/5 text-fg-2 md:col-auto md:row-auto">
                {teamMember.email}
              </DataTableCell>
              <DataTableCell className="col-start-2 row-span-2 row-start-1 text-[13px]/5 text-fg md:col-auto md:row-auto">
                {ROLE_LABEL[teamMember.role]}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
