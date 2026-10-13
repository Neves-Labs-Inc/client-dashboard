import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/admin/clients-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A box with the text line's height (20px; 16px for the mobile "Created"
// line), so the skeleton row is as tall as the real one.
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

// Same grid and cell placement as ClientRow, so nothing shifts when the rows
// arrive. Mobile and md+ sizes differ, hence the md: variants.
export default function ClientRowSkeleton(): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.name}>
        <Line>
          <Skeleton className="h-3 w-[55%] md:w-[45%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.owner}>
        <Line>
          <Skeleton className="h-3 w-[65%] md:w-[60%]" />
        </Line>
      </DataTableCell>
      <DataTableCell align="end" className={CELL_CLASS.users}>
        <Line className="justify-end">
          <Skeleton className="h-3 w-11 md:w-4" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.created}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-[40%] md:w-12" />
        </Line>
      </DataTableCell>
    </DataTableRow>
  );
}
