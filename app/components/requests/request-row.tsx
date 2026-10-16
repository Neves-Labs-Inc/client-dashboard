import { Link } from "react-router";
import RequestKind from "@/components/requests/request-kind";
import RequestStatus from "@/components/requests/request-status";
import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/requests/request-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import type { RequestRow as RequestRowData } from "@/lib/requests/requests";

type RequestRowProps = {
  request: RequestRowData;
  href: string;
  isHighlighted?: boolean;
};

// One link: the title's stretched ::after covers the row, and the row draws
// the focus ring.
export default function RequestRow({
  request,
  href,
  isHighlighted = false,
}: RequestRowProps): React.ReactNode {
  return (
    <DataTableRow
      gridClassName={ROW_GRID_CLASS}
      isLink
      isHighlighted={isHighlighted}
    >
      <DataTableCell className={CELL_CLASS.kind}>
        <RequestKind kind={request.kind} />
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.title}>
        <Link
          to={href}
          className="line-clamp-2 text-sm/5 font-medium break-words text-fg outline-hidden after:absolute after:inset-0"
        >
          {request.title}
        </Link>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.status}>
        <RequestStatus status={request.status} />
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.submitter}>
        <p className="truncate text-[13px]/5 text-fg-2">
          {request.submitterName}
        </p>
      </DataTableCell>
    </DataTableRow>
  );
}
