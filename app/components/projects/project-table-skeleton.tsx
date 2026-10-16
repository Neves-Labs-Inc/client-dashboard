import { COLUMNS, TABLE_GRID_CLASS } from "@/components/projects/project-grid";
import ProjectRowSkeleton from "@/components/projects/project-row-skeleton";
import DataTable from "@/components/ui/data-table";

const SKELETON_ROW_COUNT = 3;

// The real table frame (its header is real), with placeholder rows.
export default function ProjectTableSkeleton(): React.ReactNode {
  return (
    <DataTable
      label="Projects"
      columns={COLUMNS}
      gridClassName={TABLE_GRID_CLASS}
    >
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <ProjectRowSkeleton key={index} />
      ))}
    </DataTable>
  );
}
