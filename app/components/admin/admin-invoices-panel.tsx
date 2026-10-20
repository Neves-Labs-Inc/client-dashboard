import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import InvoiceTable from "@/components/invoices/invoice-table";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import {
  getFromInvoiceId,
  getOpenBalanceCents,
  INVOICES_COPY,
} from "@/lib/admin-invoices";
import { clearHistoryState } from "@/lib/history-state";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { formatMoney } from "@/lib/money";

type AdminInvoicesPanelProps = {
  // Null when they couldn't load. Newest first, Void included.
  invoices: InvoiceRow[] | null;
  getHref: (invoiceId: string) => string;
  highlightedId: string | null;
};

// The "Invoices" panel of a Client's tab, with what is still open in its
// meta. Back from a detail, that Invoice's number link takes focus, or the
// panel heading when its row is gone.
export default function AdminInvoicesPanel({
  invoices,
  getHref,
  highlightedId,
}: AdminInvoicesPanelProps): React.ReactNode {
  const { state } = useLocation();
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const fromInvoiceId = getFromInvoiceId(state);
  const hasFromRow =
    invoices?.some((invoice) => invoice.id === fromInvoiceId) ?? false;

  // The marker leaves the history entry, so a reload doesn't replay it.
  useEffect(() => {
    if (fromInvoiceId === null) return;

    if (!hasFromRow) panelTitleRef.current?.focus();
    clearHistoryState();
  }, [fromInvoiceId, hasFromRow]);

  let body: React.ReactNode;
  let meta: string | undefined;
  if (invoices === null) {
    body = (
      <PanelError
        message={INVOICES_COPY.loadFailed}
        getReturnFocusTarget={() => panelTitleRef.current}
      />
    );
  } else if (invoices.length === 0) {
    body = <EmptyState>{INVOICES_COPY.empty}</EmptyState>;
  } else {
    meta = `open ${formatMoney(getOpenBalanceCents(invoices))}`;
    body = (
      <InvoiceTable
        invoices={invoices}
        getHref={getHref}
        highlightedId={highlightedId}
        focusInvoiceId={fromInvoiceId}
      />
    );
  }
  return (
    <Panel title={INVOICES_COPY.invoices} titleRef={panelTitleRef} meta={meta}>
      {body}
    </Panel>
  );
}
