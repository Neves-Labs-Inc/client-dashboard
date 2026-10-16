import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import AdminRequestRow from "@/components/admin/admin-request-row";
import { AdminRequestRowsSkeleton } from "@/components/admin/admin-requests-skeleton";
import AdminRequestsTable from "@/components/admin/admin-requests-table";
import type { AdminRequestsVariant } from "@/components/admin/admin-requests-grid";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { getFromRequestId, REQUESTS_COPY } from "@/lib/admin-requests";
import { clearHistoryState } from "@/lib/history-state";
import type { RequestRow } from "@/lib/requests/requests";

type AdminRequestsPanelProps = {
  variant: AdminRequestsVariant;
  // Null when they couldn't load. Newest first.
  rows: (RequestRow & { clientName?: string })[] | null;
  meta: string | undefined;
  emptyCopy: string;
  getHref: (requestId: string) => string;
  // The inbox filter is switching: the body shows skeleton rows.
  isLoading?: boolean;
};

// The "Requests" panel of the inbox and the Client tab. Back from a
// detail, that Request's title link takes focus, or the panel heading when
// its row is gone (e.g. no longer New).
export default function AdminRequestsPanel({
  variant,
  rows,
  meta,
  emptyCopy,
  getHref,
  isLoading = false,
}: AdminRequestsPanelProps): React.ReactNode {
  const { state } = useLocation();
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const fromRequestId = getFromRequestId(state);
  const hasFromRow =
    rows?.some((request) => request.id === fromRequestId) ?? false;

  // The marker leaves the history entry, so a reload doesn't replay it.
  useEffect(() => {
    if (fromRequestId === null) return;

    if (!hasFromRow) panelTitleRef.current?.focus();
    clearHistoryState();
  }, [fromRequestId, hasFromRow]);

  let body: React.ReactNode;
  if (isLoading) {
    body = <AdminRequestRowsSkeleton variant={variant} />;
  } else if (rows === null) {
    body = (
      <PanelError
        message={REQUESTS_COPY.loadFailed}
        getReturnFocusTarget={() => panelTitleRef.current}
      />
    );
  } else if (rows.length === 0) {
    body = <EmptyState>{emptyCopy}</EmptyState>;
  } else {
    body = (
      <AdminRequestsTable variant={variant}>
        {rows.map((request) => (
          <AdminRequestRow
            key={request.id}
            variant={variant}
            request={request}
            href={getHref(request.id)}
            shouldFocusTitle={request.id === fromRequestId}
          />
        ))}
      </AdminRequestsTable>
    );
  }
  return (
    <Panel title={REQUESTS_COPY.requests} titleRef={panelTitleRef} meta={meta}>
      {body}
    </Panel>
  );
}
