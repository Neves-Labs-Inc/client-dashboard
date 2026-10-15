import {
  CELL_CLASS,
  ROW_GRID_CLASS,
} from "@/components/admin/unassigned-boards-grid";
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
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={cn("flex h-5 items-center", className)}>{children}</div>
  );
}

// Same grid and cell placement as UnassignedBoardRow, so nothing shifts
// when the rows arrive.
export default function UnassignedBoardRowSkeleton(): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.board}>
        <Line>
          <Skeleton className="h-3 w-[50%] md:w-[40%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.state}>{null}</DataTableCell>
      <DataTableCell className={CELL_CLASS.updated}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-[35%] md:w-12" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.actions}>
        <Skeleton className="h-11 w-16 md:h-8 md:w-12 pointer-coarse:h-11" />
      </DataTableCell>
    </DataTableRow>
  );
}
