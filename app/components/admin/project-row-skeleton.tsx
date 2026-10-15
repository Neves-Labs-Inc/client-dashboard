import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/admin/projects-grid";
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

// Same grid and cell placement as ProjectRow (a linked row with Sync now),
// so nothing shifts when the rows arrive.
export default function ProjectRowSkeleton(): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.name}>
        <Line>
          <Skeleton className="h-3 w-[50%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.state}>
        <Line className="justify-end md:justify-start">
          <Skeleton className="h-3 w-12" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.synced}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-28" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.actions}>
        <Skeleton className="h-11 w-24 md:h-8 md:w-20 pointer-coarse:h-11" />
      </DataTableCell>
    </DataTableRow>
  );
}
