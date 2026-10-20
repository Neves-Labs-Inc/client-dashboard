import { useRef } from "react";
import InvoiceTable from "@/components/invoices/invoice-table";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { formatMoney } from "@/lib/money";

type InvoicesPageProps = {
  clientName: string;
  // Newest issue date first, never Void; null when they couldn't load.
  invoices: InvoiceRow[] | null;
  // Open and Overdue; null when the summary couldn't load.
  openBalanceCents: number | null;
};

// "open $4,250.00", only beside a table: an empty or failed list has none.
function getMeta(
  invoices: InvoiceRow[] | null,
  openBalanceCents: number | null,
): string | undefined {
  const hasTable = invoices !== null && invoices.length > 0;
  return hasTable && openBalanceCents !== null
    ? `open ${formatMoney(openBalanceCents)}`
    : undefined;
}

// The Client's Invoices, read-only: the client area and the Admin preview
// render it alike.
export default function InvoicesPage({
  clientName,
  invoices,
  openBalanceCents,
}: InvoicesPageProps): React.ReactNode {
  const paths = useClientPaths();
  // Focused after a successful retry: the error's "Try again" goes away.
  const panelTitleRef = useRef<HTMLHeadingElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: clientName, isTruncated: true },
          { label: "Invoices" },
        ]}
        title="Invoices"
      />
      <Panel
        title="Invoices"
        titleRef={panelTitleRef}
        meta={getMeta(invoices, openBalanceCents)}
      >
        {invoices === null && (
          <PanelError
            message="Couldn't load Invoices."
            getReturnFocusTarget={() => panelTitleRef.current}
          />
        )}
        {invoices !== null && invoices.length === 0 && (
          <EmptyState>No Invoices yet.</EmptyState>
        )}
        {invoices !== null && invoices.length > 0 && (
          <InvoiceTable invoices={invoices} getHref={paths.getInvoicePath} />
        )}
      </Panel>
    </div>
  );
}
