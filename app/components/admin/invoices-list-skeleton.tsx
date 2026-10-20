import InvoiceTableSkeleton from "@/components/invoices/invoice-table-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import { cn } from "@/lib/utils";

const TAB_LABEL_WIDTHS = ["w-6", "w-8", "w-12", "w-8", "w-8"];

// A filter field in blocks: its label line, then the control.
function FieldSkeleton({
  className,
  children,
}: {
  className: string;
  children?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex h-[18px] items-center">
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-full rounded-[3px] md:h-9 pointer-coarse:h-11" />
        {children}
      </div>
    </div>
  );
}

// The global Invoices page in blocks, on the real layout's grid and
// widths: header, status tabs, filter bar (no range, no Clear filters),
// then the panel.
export default function InvoicesListSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Invoices">
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
          {TAB_LABEL_WIDTHS.map((width, index) => (
            <div
              key={index}
              className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11"
            >
              <Skeleton className={cn("h-3", width)} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 md:flex md:flex-wrap md:items-start md:gap-x-3 md:gap-y-3">
          <FieldSkeleton className="md:w-48" />
          <FieldSkeleton className="md:w-36" />
          <FieldSkeleton className="col-span-2 md:w-56">
            <Skeleton className="h-11 w-16 shrink-0 rounded-[3px] md:h-9 pointer-coarse:h-11" />
          </FieldSkeleton>
        </div>
        <div className="min-w-0 rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-16" />
          </div>
          <InvoiceTableSkeleton hasClient />
        </div>
      </div>
    </SkeletonGroup>
  );
}
