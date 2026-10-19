import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import InvoiceTableSkeleton from "@/components/invoices/invoice-table-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Invoices tab in blocks, so nothing shifts when the page arrives.
export default function ClientInvoicesSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Invoices">
      <div className="flex flex-col gap-4">
        <WorkspaceHeaderSkeleton />
        <div className="min-w-0 rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center justify-between border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <InvoiceTableSkeleton />
        </div>
      </div>
    </SkeletonGroup>
  );
}
