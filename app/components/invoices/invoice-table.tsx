import { COLUMNS, TABLE_GRID_CLASS } from "@/components/invoices/invoice-grid";
import InvoiceRow from "@/components/invoices/invoice-row";
import DataTable from "@/components/ui/data-table";
import type { InvoiceRow as InvoiceRowData } from "@/lib/invoices/invoices";

type InvoiceTableProps = {
  // Newest issue date first, as the module lists them.
  invoices: InvoiceRowData[];
  // Each area links its own way (the client's paths, the Admin's).
  getHref: (invoiceId: string) => string;
  label?: string;
  // The Admin's: the row just issued fades in its highlight.
  highlightedId?: string | null;
  // The Admin's: back from this Invoice's detail, its number link takes
  // focus once.
  focusInvoiceId?: string | null;
};

export default function InvoiceTable({
  invoices,
  getHref,
  label = "Invoices",
  highlightedId = null,
  focusInvoiceId = null,
}: InvoiceTableProps): React.ReactNode {
  return (
    <DataTable label={label} columns={COLUMNS} gridClassName={TABLE_GRID_CLASS}>
      {invoices.map((invoice) => (
        <InvoiceRow
          key={invoice.id}
          invoice={invoice}
          href={getHref(invoice.id)}
          isHighlighted={invoice.id === highlightedId}
          shouldFocusNumber={invoice.id === focusInvoiceId}
        />
      ))}
    </DataTable>
  );
}
