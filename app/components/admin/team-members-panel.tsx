import DataTable from "@/components/ui/data-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import type { TeamMember } from "@/lib/auth/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(140px,1fr)_minmax(180px,1.4fr)_96px]";
// Below md: name over email on the left, role on the right across both lines.
// Shared with the client Team skeleton, so its rows can't drift from these.
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-3 ${TABLE_GRID_CLASS}`;
const COLUMNS = [{ header: "Name" }, { header: "Email" }, { header: "Role" }];

type TeamMembersPanelProps = {
  members: TeamMember[];
};

// The Users panel of a Client's Team, for the Admin and the client area.
// Long names and emails wrap: there is no detail view to show them in full.
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
          {members.map((teamMember) => {
            const name = teamMember.name.trim();
            return (
              <DataTableRow
                key={teamMember.userId}
                gridClassName={ROW_GRID_CLASS}
              >
                {/* No name: the email stands in, once, in fg-2. */}
                <DataTableCell
                  className={cn(
                    "col-start-1 row-start-1 text-[13px]/5 wrap-anywhere md:col-auto md:row-auto",
                    name ? "font-medium text-fg" : "text-fg-2",
                  )}
                >
                  {name || teamMember.email}
                </DataTableCell>
                <DataTableCell
                  className={cn(
                    "col-start-1 row-start-2 text-[13px]/5 wrap-anywhere text-fg-2 md:col-auto md:row-auto",
                    !name && "max-md:sr-only",
                  )}
                >
                  {teamMember.email}
                </DataTableCell>
                <DataTableCell className="col-start-2 row-span-2 row-start-1 self-start text-[13px]/5 text-fg md:col-auto md:row-auto md:self-auto">
                  {ROLE_LABEL[teamMember.role]}
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTable>
      )}
    </Panel>
  );
}
