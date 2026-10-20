import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import InvoiceTable from "@/components/invoices/invoice-table";
import InvoiceTableSkeleton from "@/components/invoices/invoice-table-skeleton";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import SkeletonGroup from "@/components/ui/skeleton-group";
import {
  getFromInvoiceId,
  getOpenBalanceCents,
  INVOICES_COPY,
} from "@/lib/admin-invoices";
import { clearHistoryState } from "@/lib/history-state";
import type { InvoiceClient, InvoiceRow } from "@/lib/invoices/invoices";
import { formatMoney } from "@/lib/money";

type PanelInvoice = InvoiceRow & { client?: InvoiceClient };

type AdminInvoicesPanelProps = {
  // Null when they couldn't load. Newest first, Void included.
  invoices: PanelInvoice[] | null;
  getHref: (invoiceId: string) => string;
  highlightedId: string | null;
  // The global list's: a Client column, each row carrying its Client.
  hasClient?: boolean;
  // The meta over a non-empty list; the open balance by default.
  getMeta?: (invoices: PanelInvoice[]) => string;
  emptyCopy?: string;
  emptyAction?: React.ReactNode;
  // A same-page filter is switching: the body shows skeleton rows and the
  // meta hides (no stale total).
  isLoading?: boolean;
  // Carried on each row's link to the detail.
  linkState?: unknown;
};

function getOpenMeta(invoices: PanelInvoice[]): string {
  return `open ${formatMoney(getOpenBalanceCents(invoices))}`;
}

// The "Invoices" panel of a Client's tab and of the global list, with what
// is still open in its meta. Back from a detail, that Invoice's number link takes focus, or the
// panel heading when its row is gone.
export default function AdminInvoicesPanel({
  invoices,
  getHref,
  highlightedId,
  hasClient = false,
  getMeta = getOpenMeta,
  emptyCopy = INVOICES_COPY.empty,
  emptyAction,
  isLoading = false,
  linkState,
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
  if (isLoading) {
    body = (
      <SkeletonGroup label={INVOICES_COPY.invoices}>
        <InvoiceTableSkeleton hasClient={hasClient} />
      </SkeletonGroup>
    );
  } else if (invoices === null) {
    body = (
      <PanelError
        message={INVOICES_COPY.loadFailed}
        getReturnFocusTarget={() => panelTitleRef.current}
      />
    );
  } else if (invoices.length === 0) {
    body = <EmptyState action={emptyAction}>{emptyCopy}</EmptyState>;
  } else {
    meta = getMeta(invoices);
    body = (
      <InvoiceTable
        invoices={invoices}
        getHref={getHref}
        highlightedId={highlightedId}
        focusInvoiceId={fromInvoiceId}
        hasClient={hasClient}
        linkState={linkState}
      />
    );
  }
  return (
    <Panel title={INVOICES_COPY.invoices} titleRef={panelTitleRef} meta={meta}>
      {body}
    </Panel>
  );
}
