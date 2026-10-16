import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/requests/request-grid";
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
  return (
    <div className={cn("flex items-center gap-1.5", className)}>{children}</div>
  );
}

// Same grid and cell placement as RequestRow, so nothing shifts when the
// rows arrive.
export default function RequestRowSkeleton(): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.kind}>
        <Line className="h-5">
          <Skeleton className="size-3.5" />
          <Skeleton className="h-3 w-9" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.title}>
        <Line className="h-5">
          <Skeleton className="h-3 w-[70%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.status}>
        <Line className="h-5">
          <Skeleton className="h-3 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.submitter}>
        <Line className="h-5">
          <Skeleton className="h-2.5 w-[35%]" />
        </Line>
      </DataTableCell>
    </DataTableRow>
  );
}
