import { COLUMNS, TABLE_GRID_CLASS } from "@/components/projects/project-grid";
import ProjectRow from "@/components/projects/project-row";
import DataTable from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";

type ProjectTableProps = {
  // In the read model's order: active first, then Past.
  projects: ProjectSummary[];
};

export default function ProjectTable({
  projects,
}: ProjectTableProps): React.ReactNode {
  const hasActive = projects.some((project) => !project.isPast);

  return (
    <>
      {!hasActive && <EmptyState>No active Projects.</EmptyState>}
      <DataTable
        label="Projects"
        columns={COLUMNS}
        gridClassName={TABLE_GRID_CLASS}
      >
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </DataTable>
    </>
  );
}
