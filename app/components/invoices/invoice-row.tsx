import { useEffect, useRef } from "react";
import { Link } from "react-router";
import {
  CELL_CLASS,
  COMPACT_CELL_CLASS,
  COMPACT_ROW_GRID_CLASS,
  ROW_GRID_CLASS,
} from "@/components/invoices/invoice-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import InvoiceStatusBadge from "@/components/ui/invoice-status-badge";
import Money from "@/components/ui/money";
import { parseDateOnly } from "@/lib/format-date";
import type { InvoiceRow as InvoiceRowData } from "@/lib/invoices/invoices";

type InvoiceRowProps = {
  invoice: InvoiceRowData;
  href: string;
  // The Admin's: the row just issued.
  isHighlighted?: boolean;
  // The Admin's: back from this Invoice's detail.
  shouldFocusNumber?: boolean;
  // The Overview panel's: Issued is sr-only at every width.
  isCompact?: boolean;
};

// One link: the number's stretched ::after covers the row, and the row draws
// the focus ring. Dates are calendar days, so they never shift a day.
export default function InvoiceRow({
  invoice,
  href,
  isHighlighted = false,
  shouldFocusNumber = false,
  isCompact = false,
}: InvoiceRowProps): React.ReactNode {
  const cellClass = isCompact ? COMPACT_CELL_CLASS : CELL_CLASS;
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
      gridClassName={isCompact ? COMPACT_ROW_GRID_CLASS : ROW_GRID_CLASS}
      isLink
      isHighlighted={isHighlighted}
    >
      <DataTableCell className={cellClass.number}>
        <Link
          ref={numberRef}
          to={href}
          className="block truncate font-mono text-[13px]/5 font-medium text-fg tabular-nums outline-hidden after:absolute after:inset-0"
        >
          {invoice.number}
        </Link>
      </DataTableCell>
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
