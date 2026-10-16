import { COLUMNS, TABLE_GRID_CLASS } from "@/components/requests/request-grid";
import RequestRow from "@/components/requests/request-row";
import DataTable from "@/components/ui/data-table";
import type { RequestRow as RequestRowData } from "@/lib/requests/requests";

type RequestTableProps = {
  // Newest first, as the module lists them.
  requests: RequestRowData[];
  highlightedId?: string | null;
  getHref: (requestId: string) => string;
};

export default function RequestTable({
  requests,
  highlightedId = null,
  getHref,
}: RequestTableProps): React.ReactNode {
  return (
    <DataTable
      label="Requests"
      columns={COLUMNS}
      gridClassName={TABLE_GRID_CLASS}
    >
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          href={getHref(request.id)}
          isHighlighted={request.id === highlightedId}
        />
      ))}
    </DataTable>
  );
}
