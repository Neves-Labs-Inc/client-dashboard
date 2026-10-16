import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import NewRequestLink from "@/components/requests/new-request-link";
import RequestDrawer from "@/components/requests/request-drawer";
import RequestTable from "@/components/requests/request-table";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { EMPTY_REQUEST } from "@/hooks/use-request-form";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import {
  getRequestPath,
  NEW_REQUEST_PARAM,
  NEW_REQUEST_VALUE,
  SUBMIT_REQUEST_ACTION,
} from "@/lib/request-drawer";
import { REQUEST_COPY } from "@/lib/request-outcome";
import type { ProjectOption, RequestRow } from "@/lib/requests/requests";
import { toast } from "@/lib/toast";

type RequestsPageProps = {
  clientName: string;
  // Newest first; null when they couldn't load.
  requests: RequestRow[] | null;
  projectOptions: ProjectOption[];
};

function getMeta(requests: RequestRow[]): string | undefined {
  const newCount = requests.filter(
    (request) => request.status === "NEW",
  ).length;
  return newCount > 0 ? `${newCount} new` : undefined;
}

// The Client's Requests, newest first, and the drawer that submits one.
export default function RequestsPage({
  clientName,
  requests,
  projectOptions,
}: RequestsPageProps): React.ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const { highlightedId, highlight } = useRowHighlight(null);
  const headerLinkRef = useRef<HTMLAnchorElement>(null);
  const emptyLinkRef = useRef<HTMLAnchorElement>(null);
  // Focused after a successful retry: the error's "Try again" goes away.
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const isDrawerOpen =
    searchParams.get(NEW_REQUEST_PARAM) === NEW_REQUEST_VALUE;

  const closeDrawer = useCallback((): void => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_REQUEST_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  const handleSaved = useCallback(
    (requestId: string): void => {
      closeDrawer();
      toast(REQUEST_COPY.submitted);
      highlight(requestId);
    },
    [closeDrawer, highlight],
  );

  function handleOpenChange(open: boolean): void {
    if (!open) closeDrawer();
  }

  // The empty state's link goes away once the first Request lands, so focus
  // falls back to the header's. Null keeps the Drawer's own opener.
  function getReturnFocusTarget(): HTMLElement | null {
    return emptyLinkRef.current?.isConnected ? null : headerLinkRef.current;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: clientName, isTruncated: true },
          { label: "Requests" },
        ]}
        title="Requests"
        action={<NewRequestLink ref={headerLinkRef} />}
      />
      <Panel
        title="Requests"
        titleRef={panelTitleRef}
        meta={requests === null ? undefined : getMeta(requests)}
      >
        {requests === null && (
          <PanelError
            message="Couldn't load Requests."
            getReturnFocusTarget={() => panelTitleRef.current}
          />
        )}
        {requests !== null && requests.length === 0 && (
          <EmptyState
            action={<NewRequestLink ref={emptyLinkRef} variant="secondary" />}
          >
            No Requests yet. Report a bug or ask for a feature.
          </EmptyState>
        )}
        {requests !== null && requests.length > 0 && (
          <RequestTable
            requests={requests}
            highlightedId={highlightedId}
            getHref={getRequestPath}
          />
        )}
      </Panel>
      <RequestDrawer
        open={isDrawerOpen}
        onOpenChange={handleOpenChange}
        mode="new"
        initial={EMPTY_REQUEST}
        projectOptions={projectOptions}
        clientName={clientName}
        action={SUBMIT_REQUEST_ACTION}
        onSaved={handleSaved}
        getReturnFocusTarget={getReturnFocusTarget}
      />
    </div>
  );
}
