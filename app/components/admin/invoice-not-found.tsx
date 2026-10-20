import { CLIENTS_CRUMB } from "@/components/admin/client-workspace-header";
import RequestBackLink from "@/components/admin/request-back-link";
import PageHeader from "@/components/ui/page-header";
import {
  getClientInvoicesPath,
  INVOICES_COPY,
  INVOICES_PATH,
} from "@/lib/admin-invoices";

type InvoiceNotFoundProps =
  { route: "global" } | { route: "client"; clientId: string };

// The 404 in the main column. Nothing here confirms the Invoice exists
// under another Client.
export default function InvoiceNotFound(
  props: InvoiceNotFoundProps,
): React.ReactNode {
  const isGlobal = props.route === "global";
  const listPath = isGlobal
    ? INVOICES_PATH
    : getClientInvoicesPath(props.clientId);
  const listCrumb = { label: INVOICES_COPY.invoices, href: listPath };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={isGlobal ? [listCrumb] : [CLIENTS_CRUMB, listCrumb]}
        title={INVOICES_COPY.notFound}
      />
      <p className="text-[13px]/5 text-fg-2">{INVOICES_COPY.notFoundDetail}</p>
      <RequestBackLink to={listPath} label={INVOICES_COPY.invoices} />
    </div>
  );
}
