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
};

export default function InvoiceTable({
  invoices,
  getHref,
  label = "Invoices",
}: InvoiceTableProps): React.ReactNode {
  return (
    <DataTable label={label} columns={COLUMNS} gridClassName={TABLE_GRID_CLASS}>
      {invoices.map((invoice) => (
        <InvoiceRow
          key={invoice.id}
          invoice={invoice}
          href={getHref(invoice.id)}
        />
      ))}
    </DataTable>
  );
}
