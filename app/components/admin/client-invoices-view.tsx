import { Plus } from "lucide-react";
import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import AdminInvoicesPanel from "@/components/admin/admin-invoices-panel";
import ClientWorkspaceHeader, {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import InvoiceDrawer from "@/components/admin/invoice-drawer";
import Button from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import {
  getClientInvoicePath,
  getClientInvoicesPath,
  getIssuedToast,
  INVOICES_COPY,
  NEW_INVOICE_PARAM,
  NEW_INVOICE_VALUE,
} from "@/lib/admin-invoices";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { getTeamPath } from "@/lib/new-client";
import type { ProjectOption } from "@/lib/requests/requests";
import { toast } from "@/lib/toast";

type InvoicesData = {
  // Null when they couldn't load.
  invoices: InvoiceRow[] | null;
  projectOptions: ProjectOption[] | null;
  // The New York date: the drawer's default issue date.
  today: string;
};

type ClientInvoicesViewProps = InvoicesData & {
  clientId: string;
  // Null when it couldn't load.
  client: ClientWorkspace | null;
};

// A Client's Invoices tab, Void included, archived Clients included, and
// the drawer that issues one.
export default function ClientInvoicesView({
  clientId,
  client,
  ...data
}: ClientInvoicesViewProps): React.ReactNode {
  if (client === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[CLIENTS_CRUMB]}
          title={INVOICES_COPY.invoices}
        />
        <Panel title={INVOICES_COPY.invoices}>
          <PanelError message={INVOICES_COPY.loadFailed} />
        </Panel>
      </>
    );
  }

  return <WorkspaceInvoices clientId={clientId} client={client} {...data} />;
}

function WorkspaceInvoices({
  clientId,
  client,
  invoices,
  projectOptions,
  today,
}: InvoicesData & {
  clientId: string;
  client: ClientWorkspace;
}): React.ReactNode {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { highlightedId, highlight } = useRowHighlight(null);
  // Archive and unarchive post to the Team route, which owns them.
  const archive = useArchiveClient({
    clientName: client.name,
    action: getTeamPath(client.clientId),
    titleRef,
  });
  const isActive = client.archivedAt === null;
  // An archived Client's `?new` is ignored: its Invoices are read-only.
  const isDrawerOpen =
    isActive && searchParams.get(NEW_INVOICE_PARAM) === NEW_INVOICE_VALUE;

  const closeDrawer = useCallback((): void => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_INVOICE_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  const handleCreated = useCallback(
    (invoiceId: string, number: string): void => {
      closeDrawer();
      toast(getIssuedToast(number));
      highlight(invoiceId);
    },
    [closeDrawer, highlight],
  );

  function handleOpenDrawer(): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(NEW_INVOICE_PARAM, NEW_INVOICE_VALUE);
        return next;
      },
      { preventScrollReset: true },
    );
  }

  function handleOpenChange(open: boolean): void {
    if (!open) closeDrawer();
  }

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="invoices"
        archive={archive}
        titleRef={titleRef}
      >
        {isActive && (
          <Button
            ref={newButtonRef}
            variant="primary"
            icon={Plus}
            className="whitespace-nowrap"
            disabled={archive.isBusy}
            onClick={handleOpenDrawer}
          >
            {INVOICES_COPY.newInvoice}
          </Button>
        )}
      </ClientWorkspaceHeader>
      <AdminInvoicesPanel
        invoices={invoices}
        getHref={(invoiceId) => getClientInvoicePath(clientId, invoiceId)}
        highlightedId={highlightedId}
      />
      {isActive && (
        <InvoiceDrawer
          open={isDrawerOpen}
          onOpenChange={handleOpenChange}
          today={today}
          projectOptions={projectOptions}
          action={getClientInvoicesPath(clientId)}
          onCreated={handleCreated}
          getReturnFocusTarget={() => newButtonRef.current}
        />
      )}
    </>
  );
}
