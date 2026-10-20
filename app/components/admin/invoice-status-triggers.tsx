import Button from "@/components/ui/button";
import type { InvoiceStatusAction } from "@/hooks/use-invoice-status-action";
import {
  STATUS_INTENT_COPY,
  type StatusIntent,
} from "@/lib/admin-invoice-status";

const TRIGGER_VARIANT = {
  paid: "primary",
  revert: "secondary",
  void: "destructive",
} as const satisfies Record<StatusIntent, string>;

type InvoiceStatusTriggersProps = {
  intents: StatusIntent[];
  // The confirm that is open, or null.
  openIntent: StatusIntent | null;
  status: InvoiceStatusAction;
};

// The detail header's status buttons; each opens its inline confirm.
export default function InvoiceStatusTriggers({
  intents,
  openIntent,
  status,
}: InvoiceStatusTriggersProps): React.ReactNode {
  return (
    <div className="flex flex-wrap gap-2">
      {intents.map((intent) => (
        <Button
          key={intent}
          ref={status.triggerRefs[intent]}
          variant={TRIGGER_VARIANT[intent]}
          aria-expanded={openIntent === intent}
          aria-controls={openIntent === intent ? status.confirmId : undefined}
          // A change in flight: no other confirm until it lands.
          disabled={status.isPending}
          onClick={() => status.handleStart(intent)}
        >
          {STATUS_INTENT_COPY[intent].trigger}
        </Button>
      ))}
    </div>
  );
}
