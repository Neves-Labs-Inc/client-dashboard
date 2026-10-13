import { cn } from "@/lib/utils";

type DataTableColumn = {
  header: string;
  align?: "start" | "end";
};

type DataTableProps = {
  label: string;
  columns: DataTableColumn[];
  // Shared by the header row and the rows, e.g. "md:grid-cols-[...]".
  gridClassName: string;
  children: React.ReactNode;
};

// CSS-grid rows with ARIA table roles: the header goes sr-only below md and
// the rows stack, but the table semantics stay.
export default function DataTable({
  label,
  columns,
  gridClassName,
  children,
}: DataTableProps): React.ReactNode {
  return (
    <div role="table" aria-label={label}>
      <div role="rowgroup">
        <div
          role="row"
          className={cn(
            "sr-only md:not-sr-only md:grid md:gap-3 md:bg-surface-2 md:px-3 md:py-1.5",
            gridClassName,
          )}
        >
          {columns.map((column) => (
            <div
              key={column.header}
              role="columnheader"
              className={cn(
                "text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase",
                column.align === "end" && "text-right",
              )}
            >
              {column.header}
            </div>
          ))}
        </div>
      </div>
      <div role="rowgroup">{children}</div>
    </div>
  );
}
