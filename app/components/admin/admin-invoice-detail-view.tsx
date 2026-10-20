import { Archive } from "lucide-react";
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
  getRefusalBanner,
  getStatusIntents,
  STATUS_COPY,
  STATUS_INTENT_COPY,
  type StatusIntent,
} from "@/lib/admin-invoice-status";
import {
  getClientInvoicePath,
  getClientInvoicesPath,
  getInvoicePath,
  INVOICES_COPY,
  INVOICES_PATH,
  toFromInvoiceState,
} from "@/lib/admin-invoices";
import { getBoardPath } from "@/lib/board-detail";
import type {
  AdminInvoiceDetail,
  InvoiceDetail,
} from "@/lib/invoices/invoices";
import type { IsoDate } from "@/lib/invoices/invoice-rules";
import { getTeamPath } from "@/lib/new-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// The highlight fade's key after a status change.
const STATUS_CHANGED = "status-changed";

type AdminInvoiceDetailViewProps =
  | {
      route: "client";
      clientId: string;
      // Null when they couldn't load.
      client: ClientWorkspace | null;
      invoice: InvoiceDetail | null;
      // The Mark paid confirm's default and latest date.
      today: IsoDate;
    }
  | {
      route: "global";
      // Null when it couldn't load.
      invoice: AdminInvoiceDetail | null;
      today: IsoDate;
      // The list, with the filters it came from.
      backTo: string;
    };

// The header part of the detail, given the body's focus target, highlight
// and status triggers (null when no change is allowed).
type InvoiceHeaderParts = {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  titleClassName: string | undefined;
  triggers: React.ReactNode;
};

// One Invoice, two routes: from the global list (the number is the h1) or
// in place of a Client's Invoices tab (the workspace header keeps the h1;
// the number is an h2 under the back link).
export default function AdminInvoiceDetailView(
  props: AdminInvoiceDetailViewProps,
): React.ReactNode {
  if (props.route === "global") {
    return (
      <GlobalInvoice
        invoice={props.invoice}
        today={props.today}
        backTo={props.backTo}
      />
    );
  }

  const { clientId, client, invoice, today } = props;
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

function GlobalInvoice({
  invoice,
  today,
  backTo,
}: {
  invoice: AdminInvoiceDetail | null;
  today: IsoDate;
  backTo: string;
}): React.ReactNode {
  if (invoice === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: INVOICES_COPY.invoices }]}
          title={INVOICES_COPY.invoices}
        />
        <InvoiceLoadFailed backTo={backTo} />
      </>
    );
  }

  const { client } = invoice;
  return (
    <InvoiceBody
      clientId={client.id}
      isArchived={client.isArchived}
      hasArchivedNote={client.isArchived}
      invoice={invoice}
      today={today}
      action={getInvoicePath(invoice.id)}
      renderHeader={({ titleRef, titleClassName, triggers }) => (
        <>
          <RequestBackLink
            to={backTo}
            label={INVOICES_COPY.invoices}
            state={toFromInvoiceState(invoice.id)}
          />
          {/* The badge is inside the h1, so its name reads "NL-0007-2026
              Open". */}
          <PageHeader
            breadcrumb={[
              { label: INVOICES_COPY.invoices, href: INVOICES_PATH },
              {
                label: client.name,
                href: getClientInvoicesPath(client.id),
                isTruncated: true,
              },
            ]}
            title={
              <span className="font-mono tabular-nums">{invoice.number}</span>
            }
            badge={<InvoiceStatusBadge status={invoice.status} />}
            titleRef={titleRef}
            titleClassName={titleClassName}
            action={triggers}
          />
          {/* In place of the workspace header's Archived badge. */}
          {client.isArchived && (
            <p className="flex items-start gap-1.5 text-[13px]/5 text-fg-2">
              <Archive
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              {STATUS_COPY.archived}
            </p>
          )}
        </>
      )}
    />
  );
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
  const tabPath = getClientInvoicesPath(client.clientId);

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="invoices"
        archive={archive}
        titleRef={headerTitleRef}
      />
      {invoice === null ? (
        <InvoiceLoadFailed backTo={tabPath} />
      ) : (
        <InvoiceBody
          clientId={client.clientId}
          isArchived={client.archivedAt !== null}
          hasArchivedNote={false}
          invoice={invoice}
          today={today}
          action={getClientInvoicePath(client.clientId, invoice.id)}
          renderHeader={({ titleRef, titleClassName, triggers }) => (
            <div className="flex flex-col gap-1">
              <RequestBackLink
                to={tabPath}
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
                    titleClassName,
                  )}
                >
                  <span className="font-mono tabular-nums">
                    {invoice.number}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </h2>
                {triggers}
              </div>
            </div>
          )}
        />
      )}
    </>
  );
}

// The status changes, confirm, refusal banner and panels, shared by both
// routes. Each route renders its own header around the h1/h2 focus target
// and the triggers.
function InvoiceBody({
  clientId,
  isArchived,
  hasArchivedNote,
  invoice,
  today,
  action,
  renderHeader,
}: {
  clientId: string;
  isArchived: boolean;
  // The header shows the archived copy already (the global detail's note),
  // so an archived refusal adds no banner.
  hasArchivedNote: boolean;
  invoice: InvoiceDetail;
  today: IsoDate;
  // Where the status changes post: the route showing the Invoice.
  action: string;
  renderHeader: (parts: InvoiceHeaderParts) => React.ReactNode;
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
    action,
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
  const refusalBanner = getRefusalBanner(status.refusal, hasArchivedNote);

  return (
    <>
      {renderHeader({
        titleRef,
        titleClassName: isHighlighted ? "animate-row-highlight" : undefined,
        triggers:
          intents.length > 0 ? (
            <InvoiceStatusTriggers
              intents={intents}
              openIntent={confirmIntent}
              status={status}
            />
          ) : null,
      })}
      {confirmIntent !== null && (
        <InvoiceStatusConfirm
          intent={confirmIntent}
          number={invoice.number}
          issueDate={invoice.issueDate}
          today={today}
          status={status}
        />
      )}
      {refusalBanner !== null && (
        <FormError variant="banner">{refusalBanner}</FormError>
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
