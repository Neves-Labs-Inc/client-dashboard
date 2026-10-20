import {
  CLIENT_CELL_CLASS,
  getInvoiceGrid,
} from "@/components/invoices/invoice-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A box with the text line's height, so the skeleton row is as tall as the
// real one.
function Line({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <div className={cn("flex items-center", className)}>{children}</div>;
}

// Same grid and cell placement as InvoiceRow, so nothing shifts when the rows
// arrive. Issued is drawn from lg only: below, the real one is sr-only.
export default function InvoiceRowSkeleton({
  isCompact = false,
  hasClient = false,
}: {
  isCompact?: boolean;
  hasClient?: boolean;
}): React.ReactNode {
  const { rowGridClass, cellClass } = getInvoiceGrid({ isCompact, hasClient });

  return (
    <DataTableRow gridClassName={rowGridClass}>
      <DataTableCell className={cellClass.number}>
        <Line className="h-5">
          <Skeleton className="h-3 w-24" />
        </Line>
      </DataTableCell>
      {hasClient && (
        <DataTableCell className={CLIENT_CELL_CLASS.client}>
          <Line className="h-5">
            <Skeleton className="h-3 w-28" />
          </Line>
        </DataTableCell>
      )}
      {!isCompact && (
        <DataTableCell className="hidden lg:block">
          <Line className="h-5">
            <Skeleton className="h-3 w-12" />
          </Line>
        </DataTableCell>
      )}
      <DataTableCell className={cellClass.due}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={cellClass.amount}>
        <Line className="h-5 justify-end">
          <Skeleton className="h-3 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={cellClass.status}>
        <Skeleton className="h-[22px] w-16 rounded-[3px]" />
      </DataTableCell>
    </DataTableRow>
  );
}
