import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/projects/project-grid";
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

// Same grid and cell placement as ProjectRow, so nothing shifts when the
// rows arrive.
export default function ProjectRowSkeleton(): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.health}>
        <Line className="h-5.5">
          <Skeleton className="h-5 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.project}>
        <Line className="h-5">
          <Skeleton className="h-3 w-[60%]" />
        </Line>
        <Line className="mt-0.5 h-4">
          <Skeleton className="h-2.5 w-[35%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.update}>
        <Line className="h-5">
          <Skeleton className="h-3 w-full" />
        </Line>
        <Line className="h-5">
          <Skeleton className="h-3 w-[70%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.milestone}>
        <Line className="h-5">
          <Skeleton className="h-3 w-[60%]" />
        </Line>
        <Skeleton className="mt-1 h-1 w-full rounded-[1px]" />
        <Line className="mt-1 h-4">
          <Skeleton className="h-2.5 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.tasks}>
        <Line className="h-4">
          <Skeleton className="h-2.5 w-28" />
        </Line>
      </DataTableCell>
    </DataTableRow>
  );
}
