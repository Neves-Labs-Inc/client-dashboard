import { useRef } from "react";
import ClientWorkspaceHeader, {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import RequestBackLink from "@/components/admin/request-back-link";
import InvoiceFacts from "@/components/invoices/invoice-facts";
import InvoiceLineItems from "@/components/invoices/invoice-line-items";
import InvoiceStatusBadge from "@/components/ui/invoice-status-badge";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useArrivalFocus } from "@/hooks/use-arrival-focus";
import {
  getClientInvoicesPath,
  INVOICES_COPY,
  toFromInvoiceState,
} from "@/lib/admin-invoices";
import { getBoardPath } from "@/lib/board-detail";
import type { InvoiceDetail } from "@/lib/invoices/invoices";
import { getTeamPath } from "@/lib/new-client";

type AdminInvoiceDetailViewProps = {
  clientId: string;
  // Null when they couldn't load.
  client: ClientWorkspace | null;
  invoice: InvoiceDetail | null;
};

// One Invoice in place of a Client's Invoices tab: the workspace header
// keeps the h1, the number is an h2 under the back link.
export default function AdminInvoiceDetailView({
  clientId,
  client,
  invoice,
}: AdminInvoiceDetailViewProps): React.ReactNode {
  const tabPath = getClientInvoicesPath(clientId);
  if (client === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[CLIENTS_CRUMB]}
          title={INVOICES_COPY.invoices}
        />
        <InvoiceLoadFailed backTo={tabPath} />
      </>
    );
  }

  return <WorkspaceInvoice client={client} invoice={invoice} />;
}

function WorkspaceInvoice({
  client,
  invoice,
}: {
  client: ClientWorkspace;
  invoice: InvoiceDetail | null;
}): React.ReactNode {
  const headerTitleRef = useRef<HTMLHeadingElement>(null);
  // Archive and unarchive post to the Team route, which owns them.
  const archive = useArchiveClient({
    clientName: client.name,
    action: getTeamPath(client.clientId),
    titleRef: headerTitleRef,
  });

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="invoices"
        archive={archive}
        titleRef={headerTitleRef}
      />
      {invoice === null ? (
        <InvoiceLoadFailed backTo={getClientInvoicesPath(client.clientId)} />
      ) : (
        <InvoiceBody clientId={client.clientId} invoice={invoice} />
      )}
    </>
  );
}

function InvoiceBody({
  clientId,
  invoice,
}: {
  clientId: string;
  invoice: InvoiceDetail;
}): React.ReactNode {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(titleRef);

  return (
    <>
      <div className="flex flex-col gap-1">
        <RequestBackLink
          to={getClientInvoicesPath(clientId)}
          label={INVOICES_COPY.invoices}
          state={toFromInvoiceState(invoice.id)}
        />
        {/* The badge is inside the h2, so its name reads "NL-0007-2026
            Open". */}
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm/5 font-semibold text-fg outline-hidden"
        >
          <span className="font-mono tabular-nums">{invoice.number}</span>
          <InvoiceStatusBadge status={invoice.status} />
        </h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        {/* DOM order is the stacked order; from xl, Line Items and Memo
            take the left column and Details the right. */}
        <Panel
          title={INVOICES_COPY.details}
          className="xl:col-start-2 xl:row-start-1"
        >
          <InvoiceFacts
            detail={invoice}
            getProjectHref={(projectId) => getBoardPath(clientId, projectId)}
          />
        </Panel>
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Panel title={INVOICES_COPY.lineItems}>
            <InvoiceLineItems
              lineItems={invoice.lineItems}
              totalCents={invoice.totalCents}
            />
          </Panel>
          {invoice.memo !== null && (
            <Panel title={INVOICES_COPY.memo}>
              {/* Plain text, never Markdown or HTML. */}
              <p className="max-w-prose px-3 py-3 text-sm/5 break-words whitespace-pre-wrap text-fg">
                {invoice.memo}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function InvoiceLoadFailed({ backTo }: { backTo: string }): React.ReactNode {
  return (
    <>
      <RequestBackLink to={backTo} label={INVOICES_COPY.invoices} />
      <div className="rounded-[3px] border border-line bg-surface">
        <PanelError message={INVOICES_COPY.detailLoadFailed} />
      </div>
    </>
  );
}
