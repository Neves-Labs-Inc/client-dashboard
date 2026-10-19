import RequestTableSkeleton from "@/components/requests/request-table-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Requests page in blocks, line box for line box, so nothing shifts when
// the page arrives. The Admin preview has no action, so it draws no block.
export default function RequestsPageSkeleton({
  hasAction = true,
}: {
  hasAction?: boolean;
}): React.ReactNode {
  return (
    <SkeletonGroup label="Requests">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex h-4 items-center">
              <Skeleton className="h-3 w-[30%]" />
            </div>
            <div className="mt-1 flex h-6 items-center">
              <Skeleton className="h-[18px] w-[20%]" />
            </div>
          </div>
          {hasAction && <Skeleton className="h-11 w-36 md:h-8 md:w-32" />}
        </div>
        <div className="rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-16" />
          </div>
          <RequestTableSkeleton />
        </div>
      </div>
    </SkeletonGroup>
  );
}
