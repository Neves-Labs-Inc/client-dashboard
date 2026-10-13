import { cn } from "@/lib/utils";

type DataTableColumn = {
  header: string;
  align?: "start" | "end";
  // Read by screen readers only (e.g. an actions column); the cell keeps
  // its place in the grid.
  isLabelHidden?: boolean;
  // E.g. taking a column out of the header's flow at a breakpoint where its
  // cells move to their own line.
  className?: string;
};

// For a subgrid table's rows (see DataTable's `isSubgrid`).
export const SUBGRID_ROW_CLASS = "md:col-span-full md:grid-cols-subgrid";

type DataTableProps = {
  label: string;
  columns: DataTableColumn[];
  // Shared by the header row and the rows, e.g. "md:grid-cols-[...]".
  gridClassName: string;
  // From md, the tracks live on the table and the header and every row
  // are subgrids (rows take SUBGRID_ROW_CLASS), so an `auto` column sizes
  // once for all of them and the header lines up.
  isSubgrid?: boolean;
  children: React.ReactNode;
};

// CSS-grid rows with ARIA table roles: the header goes sr-only below md and
// the rows stack, but the table semantics stay.
export default function DataTable({
  label,
  columns,
  gridClassName,
  isSubgrid = false,
  children,
}: DataTableProps): React.ReactNode {
  const rowGroupClass = isSubgrid ? `md:grid ${SUBGRID_ROW_CLASS}` : undefined;

  return (
    <div
      role="table"
      aria-label={label}
      className={cn(isSubgrid && ["md:grid md:gap-x-3", gridClassName])}
    >
      <div role="rowgroup" className={rowGroupClass}>
        <div
          role="row"
          className={cn(
            "sr-only md:not-sr-only md:grid md:gap-3 md:bg-surface-2 md:px-3 md:py-1.5",
            isSubgrid ? SUBGRID_ROW_CLASS : gridClassName,
          )}
        >
          {columns.map((column) => (
            <div
              key={column.header}
              role="columnheader"
              className={cn(
                "text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase",
                column.align === "end" && "text-right",
                column.className,
              )}
            >
              {column.isLabelHidden ? (
                <span className="sr-only">{column.header}</span>
              ) : (
                column.header
              )}
            </div>
          ))}
        </div>
      </div>
      <div role="rowgroup" className={rowGroupClass}>
        {children}
      </div>
    </div>
  );
}
