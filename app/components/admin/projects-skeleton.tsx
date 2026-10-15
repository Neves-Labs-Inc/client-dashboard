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
        <div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-[30%]" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-[18px] w-[40%]" />
          </div>
        </div>
        {/* Border outside the row's height, as on TabNav's nav. */}
        <div className="flex border-b border-line">
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
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
