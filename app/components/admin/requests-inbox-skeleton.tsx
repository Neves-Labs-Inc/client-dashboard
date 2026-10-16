import AdminRequestsSkeleton from "@/components/admin/admin-requests-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The inbox in blocks, line box for line box: header, the New/All tabs,
// then the panel.
export default function RequestsInboxSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Requests">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-[20%]" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-[18px] w-[30%]" />
          </div>
        </div>
        {/* Border outside the row's height, as on TabNav's nav. */}
        <div className="flex border-b border-line">
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-8" />
          </div>
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-6" />
          </div>
        </div>
        <AdminRequestsSkeleton variant="inbox" />
      </div>
    </SkeletonGroup>
  );
}
