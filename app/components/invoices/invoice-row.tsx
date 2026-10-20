import { useEffect, useRef } from "react";
import { Link } from "react-router";
import ArchivedBadge from "@/components/admin/archived-badge";
import {
  CLIENT_CELL_CLASS,
  getInvoiceGrid,
} from "@/components/invoices/invoice-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import InvoiceStatusBadge from "@/components/ui/invoice-status-badge";
import Money from "@/components/ui/money";
import { parseDateOnly } from "@/lib/format-date";
import type {
  InvoiceClient,
  InvoiceRow as InvoiceRowData,
} from "@/lib/invoices/invoices";

type InvoiceRowProps = {
  invoice: InvoiceRowData;
  href: string;
  // The Admin's: the row just issued.
  isHighlighted?: boolean;
  // The Admin's: back from this Invoice's detail.
  shouldFocusNumber?: boolean;
  // The Overview panel's: Issued is sr-only at every width.
  isCompact?: boolean;
  // The Admin's global list: the Client cell, plain text (the number stays
  // the row's one link).
  client?: Pick<InvoiceClient, "name" | "isArchived">;
  // Carried on the number link to the detail.
  linkState?: unknown;
};

// One link: the number's stretched ::after covers the row, and the row draws
// the focus ring. Dates are calendar days, so they never shift a day.
export default function InvoiceRow({
  invoice,
  href,
  isHighlighted = false,
  shouldFocusNumber = false,
  isCompact = false,
  client,
  linkState,
}: InvoiceRowProps): React.ReactNode {
  const grid = getInvoiceGrid({ isCompact, hasClient: client !== undefined });
  const cellClass = grid.cellClass;
  const numberRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (shouldFocusNumber) numberRef.current?.focus();
  }, [shouldFocusNumber]);

  // A just-issued Invoice can land mid-list (a past issue date).
  useEffect(() => {
    if (isHighlighted) numberRef.current?.scrollIntoView({ block: "nearest" });
  }, [isHighlighted]);

  return (
    <DataTableRow
      gridClassName={grid.rowGridClass}
      isLink
      isHighlighted={isHighlighted}
    >
      <DataTableCell className={cellClass.number}>
        <Link
          ref={numberRef}
          to={href}
          state={linkState}
          className="block truncate font-mono text-[13px]/5 font-medium text-fg tabular-nums outline-hidden after:absolute after:inset-0"
        >
          {invoice.number}
        </Link>
      </DataTableCell>
      {client && (
        <DataTableCell className={CLIENT_CELL_CLASS.client}>
          {/* The name truncates first; the tag never does. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px]/5 text-fg-2 lg:text-fg">
              {client.name}
            </span>
            {client.isArchived && (
              <span className="shrink-0">
                <ArchivedBadge />
              </span>
            )}
          </div>
        </DataTableCell>
      )}
      <DataTableCell className={cellClass.issued}>
        <DateText
          date={parseDateOnly(invoice.issueDate)}
          className="text-[13px]/5 text-fg-2"
        />
      </DataTableCell>
      <DataTableCell className={cellClass.due}>
        <p className="font-mono text-xs/4 text-fg-2 md:text-[13px]/5">
          <span className="md:hidden">Due </span>
          <DateText date={parseDateOnly(invoice.dueDate)} />
        </p>
      </DataTableCell>
      <DataTableCell align="end" className={cellClass.amount}>
        <Money cents={invoice.totalCents} className="text-[13px]/5 text-fg" />
      </DataTableCell>
      <DataTableCell className={cellClass.status}>
        <InvoiceStatusBadge status={invoice.status} />
      </DataTableCell>
    </DataTableRow>
  );
}
