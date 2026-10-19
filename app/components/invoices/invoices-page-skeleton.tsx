import InvoiceTableSkeleton from "@/components/invoices/invoice-table-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Invoices page in blocks, line box for line box, so nothing shifts when
// the page arrives. The page has no header action, so it draws no block.
export default function InvoicesPageSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Invoices">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-[30%]" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-[18px] w-[20%]" />
          </div>
        </div>
        <div className="rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <InvoiceTableSkeleton />
        </div>
      </div>
    </SkeletonGroup>
  );
}
