import InvoiceTableSkeleton from "@/components/invoices/invoice-table-skeleton";
import ProjectTableSkeleton from "@/components/projects/project-table-skeleton";
import RequestTableSkeleton from "@/components/requests/request-table-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import SummaryRowSkeleton from "@/components/ui/summary-row-skeleton";

const TILE_COUNT = 4;

// The Overview in blocks, line box for line box, so nothing shifts when the
// page arrives. The Admin preview has no actions, so it draws no blocks.
export default function OverviewSkeleton({
  isReadOnly = false,
}: {
  isReadOnly?: boolean;
}): React.ReactNode {
  return (
    <SkeletonGroup label="overview">
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
          {!isReadOnly && (
            <Skeleton className="h-11 w-36 md:h-8 md:w-[118px] pointer-coarse:h-11" />
          )}
        </div>
        <SummaryRowSkeleton count={TILE_COUNT} />
        <div className="rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-16" />
          </div>
          <ProjectTableSkeleton />
        </div>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="rounded-[3px] border border-line bg-surface">
            <div className="flex min-h-10 items-center justify-between border-b border-line px-3 py-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <InvoiceTableSkeleton isCompact />
          </div>
          <div className="rounded-[3px] border border-line bg-surface">
            <div className="flex min-h-10 items-center justify-between border-b border-line px-3 py-2">
              <Skeleton className="h-3 w-16" />
              {!isReadOnly && (
                <Skeleton className="h-11 w-16 md:h-8 md:w-14 pointer-coarse:h-11" />
              )}
            </div>
            <RequestTableSkeleton />
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
