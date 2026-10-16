import { useEffect, useRef } from "react";
import { Link } from "react-router";
import {
  CELL_CLASS,
  ROW_GRID_CLASS,
  type AdminRequestsVariant,
} from "@/components/admin/admin-requests-grid";
import RequestKind from "@/components/requests/request-kind";
import RequestStatus from "@/components/requests/request-status";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import type { RequestRow } from "@/lib/requests/requests";

type AdminRequestRowProps = {
  variant: AdminRequestsVariant;
  // The inbox passes the Client's name.
  request: RequestRow & { clientName?: string };
  href: string;
  // Back from this row's detail: its title link takes focus once.
  shouldFocusTitle: boolean;
};

// A linking row: the title's link covers the row.
export default function AdminRequestRow({
  variant,
  request,
  href,
  shouldFocusTitle,
}: AdminRequestRowProps): React.ReactNode {
  const titleRef = useRef<HTMLAnchorElement>(null);
  const cells = CELL_CLASS[variant];

  useEffect(() => {
    if (shouldFocusTitle) titleRef.current?.focus();
  }, [shouldFocusTitle]);

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isLink>
      {variant === "inbox" && (
        <DataTableCell
          className={`${CELL_CLASS.inbox.client} truncate font-mono text-xs/4 text-fg-2 uppercase lg:font-sans lg:text-[13px]/5 lg:text-fg lg:normal-case`}
        >
          {request.clientName}
        </DataTableCell>
      )}
      <DataTableCell className={cells.kind}>
        <RequestKind kind={request.kind} />
      </DataTableCell>
      <DataTableCell className={cells.title}>
        <Link
          ref={titleRef}
          to={href}
          className="line-clamp-2 text-sm/5 font-medium wrap-anywhere text-fg outline-hidden after:absolute after:inset-0 md:text-[13px]/5"
        >
          {request.title}
        </Link>
      </DataTableCell>
      <DataTableCell className={cells.status}>
        <RequestStatus status={request.status} />
      </DataTableCell>
      <DataTableCell
        className={`${cells.submitter} truncate text-[13px]/5 text-fg-2`}
      >
        {request.submitterName}
      </DataTableCell>
      <DataTableCell
        className={`${cells.submitted} font-mono text-xs/4 whitespace-nowrap text-fg-2 md:text-[13px]/5`}
      >
        <DateText date={request.createdAt} />
      </DataTableCell>
    </DataTableRow>
  );
}
