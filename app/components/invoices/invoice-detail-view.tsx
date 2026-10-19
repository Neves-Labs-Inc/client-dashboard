import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import InvoiceFacts from "@/components/invoices/invoice-facts";
import InvoiceLineItems from "@/components/invoices/invoice-line-items";
import { buttonStyles } from "@/components/ui/button-styles";
import InvoiceStatusBadge from "@/components/ui/invoice-status-badge";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { ClientInvoiceDetail } from "@/lib/invoices/client-invoice";
import { cn } from "@/lib/utils";

const LINK_BUTTON_CLASS =
  "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4";

type InvoiceDetailViewProps = {
  clientName: string;
  detail: ClientInvoiceDetail;
};

// One Invoice for its Client, read-only: its facts, Line Items and memo. The
// client area and the Admin preview render it alike.
export default function InvoiceDetailView({
  clientName,
  detail,
}: InvoiceDetailViewProps): React.ReactNode {
  const paths = useClientPaths();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: clientName, isTruncated: true },
          { label: "Invoices", href: paths.invoices },
        ]}
        title={detail.number}
        badge={<InvoiceStatusBadge status={detail.status} />}
        action={
          <Link
            to={paths.invoices}
            className={cn(
              buttonStyles({ variant: "secondary" }),
              LINK_BUTTON_CLASS,
            )}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Invoices
          </Link>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        {/* DOM order is the stacked order; from xl, Line Items and Memo take
            the left column and Details the right. */}
        <Panel title="Details" className="xl:col-start-2 xl:row-start-1">
          <InvoiceFacts detail={detail} getProjectHref={paths.getProjectPath} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Panel title="Line items">
            <InvoiceLineItems
              lineItems={detail.lineItems}
              totalCents={detail.totalCents}
            />
          </Panel>
          {detail.memo !== null && (
            <Panel title="Memo">
              {/* Plain text, never Markdown or HTML. */}
              <p className="max-w-prose px-3 py-3 text-sm/5 break-words whitespace-pre-wrap text-fg">
                {detail.memo}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
