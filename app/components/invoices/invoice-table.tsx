import { getInvoiceGrid } from "@/components/invoices/invoice-grid";
import InvoiceRow from "@/components/invoices/invoice-row";
import DataTable from "@/components/ui/data-table";
import type {
  InvoiceClient,
  InvoiceRow as InvoiceRowData,
} from "@/lib/invoices/invoices";

type InvoiceTableProps = {
  // Newest issue date first, as the module lists them. The Admin's global
  // list carries each row's Client.
  invoices: (InvoiceRowData & { client?: InvoiceClient })[];
  // Each area links its own way (the client's paths, the Admin's).
  getHref: (invoiceId: string) => string;
  label?: string;
  // The Admin's: the row just issued fades in its highlight.
  highlightedId?: string | null;
  // The Admin's: back from this Invoice's detail, its number link takes
  // focus once.
  focusInvoiceId?: string | null;
  // The Overview panel's: Issued stays sr-only at every width.
  isCompact?: boolean;
  // The Admin's global list: a Client column.
  hasClient?: boolean;
  // The global list's: carried to the detail, so its back link can
  // restore the filters.
  linkState?: unknown;
};

export default function InvoiceTable({
  invoices,
  getHref,
  label = "Invoices",
  highlightedId = null,
  focusInvoiceId = null,
  isCompact = false,
  hasClient = false,
  linkState,
}: InvoiceTableProps): React.ReactNode {
  const grid = getInvoiceGrid({ isCompact, hasClient });

  return (
    <DataTable
      label={label}
      columns={grid.columns}
      gridClassName={grid.tableGridClass}
    >
      {invoices.map((invoice) => (
        <InvoiceRow
          key={invoice.id}
          invoice={invoice}
          href={getHref(invoice.id)}
          isHighlighted={invoice.id === highlightedId}
          shouldFocusNumber={invoice.id === focusInvoiceId}
          isCompact={isCompact}
          client={hasClient ? invoice.client : undefined}
          linkState={linkState}
        />
      ))}
    </DataTable>
  );
}
