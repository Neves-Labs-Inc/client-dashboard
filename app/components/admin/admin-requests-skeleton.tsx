import {
  CELL_CLASS,
  ROW_GRID_CLASS,
  type AdminRequestsVariant,
} from "@/components/admin/admin-requests-grid";
import AdminRequestsTable from "@/components/admin/admin-requests-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import Skeleton from "@/components/ui/skeleton";

const DEFAULT_ROW_COUNT = 4;

type AdminRequestsSkeletonProps = {
  variant: AdminRequestsVariant;
  rows?: number;
};

// A box with a text line's height, so blocks sit where the text will.
function Line({
  className = "h-5",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <div className={`flex items-center ${className}`}>{children}</div>;
}

// The "Requests" panel in blocks: its header, then the rows on the table's
// grid. Callers wrap it in their SkeletonGroup.
export default function AdminRequestsSkeleton({
  variant,
  rows = DEFAULT_ROW_COUNT,
}: AdminRequestsSkeletonProps): React.ReactNode {
  return (
    <div className="min-w-0 rounded-[3px] border border-line bg-surface">
      <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
        <Skeleton className="h-3 w-16" />
      </div>
      <AdminRequestRowsSkeleton variant={variant} rows={rows} />
    </div>
  );
}

// The table with skeleton rows: the panel body while the inbox filter
// switches.
export function AdminRequestRowsSkeleton({
  variant,
  rows = DEFAULT_ROW_COUNT,
}: AdminRequestsSkeletonProps): React.ReactNode {
  return (
    <AdminRequestsTable variant={variant}>
      {Array.from({ length: rows }, (_, index) => (
        <RowSkeleton key={index} variant={variant} />
      ))}
    </AdminRequestsTable>
  );
}

// Same grid and cell placement as AdminRequestRow.
function RowSkeleton({
  variant,
}: {
  variant: AdminRequestsVariant;
}): React.ReactNode {
  const cells = CELL_CLASS[variant];

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      {variant === "inbox" && (
        <DataTableCell className={CELL_CLASS.inbox.client}>
          <Line className="h-4 lg:h-5">
            <Skeleton className="h-2.5 w-16" />
          </Line>
        </DataTableCell>
      )}
      <DataTableCell className={cells.kind}>
        <Line>
          <Skeleton className="h-3 w-12" />
        </Line>
      </DataTableCell>
      <DataTableCell className={cells.title}>
        <Line>
          <Skeleton className="h-3 w-[70%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={cells.status}>
        <Line>
          <Skeleton className="h-3 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={cells.submitter}>
        <Line>
          <Skeleton className="h-2.5 w-[35%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={cells.submitted}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-12" />
        </Line>
      </DataTableCell>
    </DataTableRow>
  );
}
