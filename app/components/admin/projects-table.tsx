import {
  ACTIONS_HEADER_CLASS,
  TABLE_GRID_CLASS,
} from "@/components/admin/projects-grid";
import DataTable from "@/components/ui/data-table";

const COLUMNS = [
  { header: "Name" },
  { header: "State" },
  { header: "Last synced" },
  { header: "Actions", isLabelHidden: true, className: ACTIONS_HEADER_CLASS },
];

type ProjectsTableProps = {
  children: React.ReactNode;
};

// The Projects table's frame, shared by the rows and their skeleton.
export default function ProjectsTable({
  children,
}: ProjectsTableProps): React.ReactNode {
  return (
    <DataTable
      label="Projects"
      columns={COLUMNS}
      gridClassName={TABLE_GRID_CLASS}
      isSubgrid
    >
      {children}
    </DataTable>
  );
}
