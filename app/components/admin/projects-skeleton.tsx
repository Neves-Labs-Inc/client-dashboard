import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import ProjectRowSkeleton from "@/components/admin/project-row-skeleton";
import ProjectsTable from "@/components/admin/projects-table";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const ROW_COUNT = 3;

// The Projects & boards tab in blocks, line box for line box, so nothing
// shifts when the page arrives.
export default function ProjectsSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Projects">
      <div className="flex flex-col gap-4">
        <WorkspaceHeaderSkeleton />
        <div className="rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-16" />
          </div>
          <ProjectsTable>
            {Array.from({ length: ROW_COUNT }, (_, index) => (
              <ProjectRowSkeleton key={index} />
            ))}
          </ProjectsTable>
        </div>
      </div>
    </SkeletonGroup>
  );
}
