import { getInvoiceGrid } from "@/components/invoices/invoice-grid";
import InvoiceRowSkeleton from "@/components/invoices/invoice-row-skeleton";
import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SKELETON_ROW_COUNT = 5;

// The table in blocks: a text-free header row from md (hidden below, as the
// real one is sr-only there), then placeholder rows. The caller wraps it in
// a SkeletonGroup.
export default function InvoiceTableSkeleton({
  isCompact = false,
  hasClient = false,
}: {
  isCompact?: boolean;
  hasClient?: boolean;
}): React.ReactNode {
  const { columns, tableGridClass } = getInvoiceGrid({ isCompact, hasClient });

  return (
    <div>
      <div
        className={cn(
          "hidden gap-3 bg-surface-2 px-3 py-1.5 md:grid",
          tableGridClass,
        )}
      >
        {columns.map((column) => (
          <div
            key={column.header}
            className={cn(
              "flex h-4 items-center",
              column.align === "end" && "justify-end",
              column.className,
            )}
          >
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}
      </div>
      {/* Its own group, so the first row drops its top hairline as the real
          table's does. */}
      <div>
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <InvoiceRowSkeleton
            key={index}
            isCompact={isCompact}
            hasClient={hasClient}
          />
        ))}
      </div>
    </div>
  );
}
