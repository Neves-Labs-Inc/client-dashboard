import InvoiceStatusIcon from "@/components/ui/invoice-status-icon";
import { cn } from "@/lib/utils";

// Void is only ever shown to the Admin.
export type InvoiceDisplayStatus = "OPEN" | "PAID" | "OVERDUE" | "VOID";

type InvoiceStatusBadgeProps = {
  status: InvoiceDisplayStatus;
  className?: string;
};

export const INVOICE_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  OPEN: "Open",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};

// A literal map, so Tailwind sees every class.
const TONE_CLASS: Record<InvoiceDisplayStatus, string> = {
  OPEN: "border-fg-2 bg-surface-2 text-fg-2",
  PAID: "border-ok bg-ok-subtle text-ok",
  OVERDUE: "border-off bg-off-subtle text-off",
  VOID: "border-dashed border-fg-2 bg-transparent text-fg-2",
};

export default function InvoiceStatusBadge({
  status,
  className,
}: InvoiceStatusBadgeProps): React.ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 text-xs/4 font-medium whitespace-nowrap",
        TONE_CLASS[status],
        className,
      )}
    >
      <InvoiceStatusIcon status={status} size={12} />
      {INVOICE_STATUS_LABEL[status]}
    </span>
  );
}
