import {
  STACKED_HEADER_CLASS,
  TABLE_GRID_CLASS,
  type AdminRequestsVariant,
} from "@/components/admin/admin-requests-grid";
import DataTable from "@/components/ui/data-table";

const CLIENT_COLUMN = { header: "Client", className: STACKED_HEADER_CLASS };
const COLUMNS = [
  { header: "Kind" },
  { header: "Title" },
  { header: "Status" },
  { header: "Submitter", className: STACKED_HEADER_CLASS },
  { header: "Submitted" },
];

type AdminRequestsTableProps = {
  // `inbox` adds the Client column.
  variant: AdminRequestsVariant;
  children: React.ReactNode;
};

// The Requests table's frame, shared by the rows and their skeleton.
export default function AdminRequestsTable({
  variant,
  children,
}: AdminRequestsTableProps): React.ReactNode {
  return (
    <DataTable
      label="Requests"
      columns={variant === "inbox" ? [CLIENT_COLUMN, ...COLUMNS] : COLUMNS}
      gridClassName={TABLE_GRID_CLASS[variant]}
      isSubgrid
    >
      {children}
    </DataTable>
  );
}
