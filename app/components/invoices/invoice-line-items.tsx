import DataTable from "@/components/ui/data-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import Money from "@/components/ui/money";
import type { InvoiceDetail } from "@/lib/invoices/invoices";

type InvoiceLineItemsProps = {
  // By position.
  lineItems: InvoiceDetail["lineItems"];
  totalCents: number;
};

// Two columns at every width: 8rem holds "$50,000,000.00", so nothing needs
// to re-flow and long descriptions wrap beside one right edge of amounts.
// md:items-start overrides DataTableRow's md:items-center, so an amount
// stays on its description's first line at every width.
const GRID_CLASS = "grid-cols-[minmax(0,1fr)_8rem] gap-x-3 md:items-start";

const COLUMNS = [
  { header: "Description" },
  { header: "Amount", align: "end" as const },
];

// The Line Items panel's body: one row each, then the Total. Not links.
export default function InvoiceLineItems({
  lineItems,
  totalCents,
}: InvoiceLineItemsProps): React.ReactNode {
  return (
    <DataTable label="Line items" columns={COLUMNS} gridClassName={GRID_CLASS}>
      {lineItems.map((lineItem) => (
        <DataTableRow key={lineItem.id} gridClassName={GRID_CLASS}>
          <DataTableCell>
            <p className="text-[13px]/5 break-words text-fg">
              {lineItem.description}
            </p>
          </DataTableCell>
          <DataTableCell align="end">
            <Money
              cents={lineItem.amountCents}
              className="text-[13px]/5 text-fg"
            />
          </DataTableCell>
        </DataTableRow>
      ))}
      {/* The row's classes take the fill too: a wrapper would break its
          hairline and the table's row structure. */}
      <DataTableRow gridClassName={`${GRID_CLASS} bg-surface-2`}>
        <DataTableCell>
          <p className="text-[13px]/5 font-semibold text-fg">Total</p>
        </DataTableCell>
        <DataTableCell align="end">
          <Money
            cents={totalCents}
            className="text-[13px]/5 font-medium text-fg"
          />
        </DataTableCell>
      </DataTableRow>
    </DataTable>
  );
}
