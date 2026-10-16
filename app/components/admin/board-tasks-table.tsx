import {
  SECOND_LINE_HEADER_CLASS,
  TABLE_GRID_CLASS,
} from "@/components/admin/board-tasks-grid";
import DataTable from "@/components/ui/data-table";

const COLUMNS = [
  { header: "Title" },
  { header: "Client status" },
  { header: "Status option", className: SECOND_LINE_HEADER_CLASS },
  { header: "Milestone", className: SECOND_LINE_HEADER_CLASS },
  { header: "Target" },
];

// The Tasks table's frame, shared by the rows and their skeleton.
export default function BoardTasksTable({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <DataTable
      label="Tasks"
      columns={COLUMNS}
      gridClassName={TABLE_GRID_CLASS}
      isSubgrid
    >
      {children}
    </DataTable>
  );
}
