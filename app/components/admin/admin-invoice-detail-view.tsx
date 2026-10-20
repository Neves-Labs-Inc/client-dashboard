import { useCallback, useRef } from "react";
import ClientWorkspaceHeader, {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import InvoiceStatusConfirm from "@/components/admin/invoice-status-confirm";
import InvoiceStatusTriggers from "@/components/admin/invoice-status-triggers";
import RequestBackLink from "@/components/admin/request-back-link";
import InvoiceFacts from "@/components/invoices/invoice-facts";
import InvoiceLineItems from "@/components/invoices/invoice-line-items";
import FormError from "@/components/ui/form-error";
import InvoiceStatusBadge from "@/components/ui/invoice-status-badge";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useArrivalFocus } from "@/hooks/use-arrival-focus";
import { useInvoiceStatusAction } from "@/hooks/use-invoice-status-action";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import {
  getStatusIntents,
  STATUS_INTENT_COPY,
  type StatusIntent,
} from "@/lib/admin-invoice-status";
import {
  getClientInvoicePath,
  getClientInvoicesPath,
  INVOICES_COPY,
  toFromInvoiceState,
} from "@/lib/admin-invoices";
import { getBoardPath } from "@/lib/board-detail";
import type { InvoiceDetail } from "@/lib/invoices/invoices";
import type { IsoDate } from "@/lib/invoices/invoice-rules";
import { getTeamPath } from "@/lib/new-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// The highlight fade's key after a status change.
const STATUS_CHANGED = "status-changed";

type AdminInvoiceDetailViewProps = {
  clientId: string;
  // Null when they couldn't load.
  client: ClientWorkspace | null;
  invoice: InvoiceDetail | null;
  // The Mark paid confirm's default and latest date.
  today: IsoDate;
};

// One Invoice in place of a Client's Invoices tab: the workspace header
// keeps the h1, the number is an h2 under the back link.
export default function AdminInvoiceDetailView({
  clientId,
  client,
  invoice,
  today,
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

  return <WorkspaceInvoice client={client} invoice={invoice} today={today} />;
}

function WorkspaceInvoice({
  client,
  invoice,
  today,
}: {
  client: ClientWorkspace;
  invoice: InvoiceDetail | null;
  today: IsoDate;
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
        <InvoiceBody
          clientId={client.clientId}
          isArchived={client.archivedAt !== null}
          invoice={invoice}
          today={today}
        />
      )}
    </>
  );
}

function InvoiceBody({
  clientId,
  isArchived,
  invoice,
  today,
}: {
  clientId: string;
  isArchived: boolean;
  invoice: InvoiceDetail;
  today: IsoDate;
}): React.ReactNode {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(titleRef);
  const { highlightedId, highlight } = useRowHighlight(null);

  // The triggers change under it: focus would drop to <body>.
  const handleChanged = useCallback(
    (intent: StatusIntent): void => {
      toast(STATUS_INTENT_COPY[intent].changed);
      highlight(STATUS_CHANGED);
      titleRef.current?.focus();
    },
    [highlight],
  );

  const handleRefused = useCallback((): void => {
    titleRef.current?.focus();
  }, []);

  const status = useInvoiceStatusAction({
    action: getClientInvoicePath(clientId, invoice.id),
    issueDate: invoice.issueDate,
    today,
    onChanged: handleChanged,
    onRefused: handleRefused,
  });
  const intents = getStatusIntents(invoice.status, isArchived);
  // The open confirm, while its Invoice still allows it.
  const confirmIntent =
    status.openIntent !== null && intents.includes(status.openIntent)
      ? status.openIntent
      : null;
  const isHighlighted = highlightedId === STATUS_CHANGED;

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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2
            ref={titleRef}
            tabIndex={-1}
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm/5 font-semibold text-fg outline-hidden",
              isHighlighted && "animate-row-highlight",
            )}
          >
            <span className="font-mono tabular-nums">{invoice.number}</span>
            <InvoiceStatusBadge status={invoice.status} />
          </h2>
          {intents.length > 0 && (
            <InvoiceStatusTriggers
              intents={intents}
              openIntent={confirmIntent}
              status={status}
            />
          )}
        </div>
      </div>
      {confirmIntent !== null && (
        <InvoiceStatusConfirm
          intent={confirmIntent}
          number={invoice.number}
          issueDate={invoice.issueDate}
          today={today}
          status={status}
        />
      )}
      {status.refusal !== null && (
        <FormError variant="banner">{status.refusal}</FormError>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        {/* DOM order is the stacked order; from xl, Line Items and Memo
            take the left column and Details the right. */}
        <Panel
          title={INVOICES_COPY.details}
          className="xl:col-start-2 xl:row-start-1"
        >
          <div className={cn(isHighlighted && "animate-row-highlight")}>
            <InvoiceFacts
              detail={invoice}
              getProjectHref={(projectId) => getBoardPath(clientId, projectId)}
            />
          </div>
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
