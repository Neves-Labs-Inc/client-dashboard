import { Suspense, useRef } from "react";
import { Await, Link } from "react-router";
import InvoiceTable from "@/components/invoices/invoice-table";
import InvoiceTableSkeleton from "@/components/invoices/invoice-table-skeleton";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { InvoiceRow, InvoiceSummary } from "@/lib/invoices/invoices";
import { formatMoney } from "@/lib/money";

// The Overview shows this many; the loader asks for one more to know whether
// to offer "View all".
export const OVERVIEW_INVOICE_LIMIT = 5;

// Fades in with the body's skeleton (150ms delay), so it never flashes alone.
// On a wrapper: Skeleton's own pulse sets `animation` and would override it.
function MetaSkeleton(): React.ReactNode {
  return (
    <div className="animate-in delay-150 duration-(--dur-base) ease-out fade-in-0 fill-mode-both motion-reduce:duration-(--dur-instant)">
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

type InvoicesPanelProps = {
  // Newest first, never Void, at most OVERVIEW_INVOICE_LIMIT + 1; null when
  // they couldn't load.
  invoices: Promise<InvoiceRow[] | null>;
  // Null when the summary couldn't load.
  summary: Promise<InvoiceSummary | null>;
};

// Read-only, so the client area and the Admin preview render it alike.
export default function InvoicesPanel({
  invoices,
  summary,
}: InvoicesPanelProps): React.ReactNode {
  const paths = useClientPaths();
  // Focused after a successful retry: the error's "Try again" goes away.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const renderPanel = (
    children: React.ReactNode,
    meta?: React.ReactNode,
  ): React.ReactNode => (
    <Panel
      title="Invoices"
      titleHref={paths.invoices}
      titleRef={titleRef}
      meta={meta}
    >
      {children}
    </Panel>
  );
  const error = renderPanel(
    <PanelError
      message="Couldn't load Invoices."
      getReturnFocusTarget={() => titleRef.current}
    />,
  );

  return (
    <Suspense
      fallback={
        <Panel
          title="Invoices"
          titleHref={paths.invoices}
          meta={<MetaSkeleton />}
        >
          <SkeletonGroup label="Invoices">
            <InvoiceTableSkeleton isCompact />
          </SkeletonGroup>
        </Panel>
      }
    >
      <Await resolve={invoices} errorElement={error}>
        {(resolved) => {
          if (resolved === null) return error;
          if (resolved.length === 0) {
            return renderPanel(<EmptyState>No Invoices yet.</EmptyState>);
          }

          return renderPanel(
            <>
              <InvoiceTable
                invoices={resolved.slice(0, OVERVIEW_INVOICE_LIMIT)}
                getHref={paths.getInvoicePath}
                isCompact
              />
              {resolved.length > OVERVIEW_INVOICE_LIMIT && (
                <Link
                  to={paths.invoices}
                  aria-label="View all Invoices"
                  className="flex min-h-10 w-full items-center border-t border-line px-3 text-[13px]/5 text-accent-fg transition-colors duration-(--dur-instant) hover:bg-surface-2 hover:underline focus-visible:-outline-offset-2 active:bg-surface-3 pointer-coarse:min-h-11"
                >
                  View all
                </Link>
              )}
            </>,
            <OpenBalance summary={summary} />,
          );
        }}
      </Await>
    </Suspense>
  );
}

// Streams on its own, so a slow summary never holds the rows. A failed one
// shows nothing: an empty element, because a falsy errorElement makes Await
// rethrow into the list's own Await.
function OpenBalance({
  summary,
}: {
  summary: Promise<InvoiceSummary | null>;
}): React.ReactNode {
  return (
    <Suspense fallback={<MetaSkeleton />}>
      <Await resolve={summary} errorElement={<></>}>
        {(resolved) =>
          resolved && `open ${formatMoney(resolved.openBalanceCents)}`
        }
      </Await>
    </Suspense>
  );
}
