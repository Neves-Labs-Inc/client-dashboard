import InvoiceStatusBadge, {
  INVOICE_STATUS_LABEL,
  type InvoiceDisplayStatus,
} from "@/components/ui/invoice-status-badge";
import InvoiceStatusIcon from "@/components/ui/invoice-status-icon";
import Money from "@/components/ui/money";
import Panel from "@/components/ui/panel";

const STATUSES: InvoiceDisplayStatus[] = ["OPEN", "PAID", "OVERDUE", "VOID"];
const ICON_SIZES = [12, 14, 16] as const;
const SAMPLE_CENTS = [0, 125050, -5000, 100000000];

const ICON_TONE: Record<InvoiceDisplayStatus, string> = {
  OPEN: "text-fg-2",
  PAID: "text-ok",
  OVERDUE: "text-off",
  VOID: "text-fg-2",
};

const LABEL_CLASS =
  "mb-2 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase";

type MoneyRowsProps = {
  className?: string;
};

function MoneyRows({ className }: MoneyRowsProps): React.ReactNode {
  return (
    <dl className="grid max-w-xs grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1">
      {SAMPLE_CENTS.map((cents) => (
        <div key={cents} className="col-span-2 grid grid-cols-subgrid">
          <dt className="font-mono text-xs/4 text-fg-2">{cents}</dt>
          <dd className="text-right">
            <Money cents={cents} className={className} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function DevInvoicePanel(): React.ReactNode {
  return (
    <Panel
      id="invoice"
      title="Invoice status & money"
      meta="Badge · icon · Money"
    >
      <div className="flex flex-col gap-4 p-3 text-[13px]/5 text-fg">
        <section aria-labelledby="dev-invoice-badge">
          <h3 id="dev-invoice-badge" className={LABEL_CLASS}>
            Invoice status badge
          </h3>
          <ul className="flex flex-wrap gap-3">
            {STATUSES.map((status) => (
              <li key={status}>
                <InvoiceStatusBadge status={status} />
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="dev-invoice-icon">
          <h3 id="dev-invoice-icon" className={LABEL_CLASS}>
            Invoice status icon
          </h3>
          <div className="flex flex-col gap-2">
            {ICON_SIZES.map((size) => (
              <ul key={size} className="flex flex-wrap gap-4">
                {STATUSES.map((status) => (
                  <li
                    key={status}
                    className="flex items-center gap-1.5 text-xs/4 text-fg-2"
                  >
                    <InvoiceStatusIcon
                      status={status}
                      size={size}
                      className={ICON_TONE[status]}
                    />
                    {INVOICE_STATUS_LABEL[status]} {size}px
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
        <section aria-labelledby="dev-invoice-money">
          <h3 id="dev-invoice-money" className={LABEL_CLASS}>
            Money
          </h3>
          <div className="flex flex-col gap-4">
            <MoneyRows />
            <MoneyRows className="text-xl/7 font-medium" />
          </div>
        </section>
      </div>
    </Panel>
  );
}
