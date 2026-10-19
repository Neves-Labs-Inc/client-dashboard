import { CLIENTS_CRUMB } from "@/components/admin/client-workspace-header";
import RequestBackLink from "@/components/admin/request-back-link";
import PageHeader from "@/components/ui/page-header";
import { getClientInvoicesPath, INVOICES_COPY } from "@/lib/admin-invoices";

type InvoiceNotFoundProps = {
  clientId: string;
};

// The 404 in the main column. Nothing here confirms the Invoice exists
// under another Client.
export default function InvoiceNotFound({
  clientId,
}: InvoiceNotFoundProps): React.ReactNode {
  const listPath = getClientInvoicesPath(clientId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          CLIENTS_CRUMB,
          { label: INVOICES_COPY.invoices, href: listPath },
        ]}
        title={INVOICES_COPY.notFound}
      />
      <p className="text-[13px]/5 text-fg-2">{INVOICES_COPY.notFoundDetail}</p>
      <RequestBackLink to={listPath} label={INVOICES_COPY.invoices} />
    </div>
  );
}
