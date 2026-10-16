import { useId } from "react";
import { ArchiveAlert } from "@/components/admin/archive-confirm";
import Button from "@/components/ui/button";
import type { WithdrawRequest } from "@/hooks/use-withdraw-request";
import { REQUEST_COPY } from "@/lib/request-outcome";

const ENTER_CLASS =
  "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0";

type RequestWithdrawConfirmProps = {
  withdraw: WithdrawRequest;
};

// The inline confirm under the detail's header, full width (as
// ArchiveConfirm): prompt over its buttons below md, side by side from md.
export default function RequestWithdrawConfirm({
  withdraw,
}: RequestWithdrawConfirmProps): React.ReactNode {
  const promptId = useId();

  return (
    <div
      id={withdraw.confirmId}
      role="group"
      aria-labelledby={promptId}
      onKeyDown={withdraw.handleConfirmKeyDown}
      className={`flex flex-col gap-3 rounded-[3px] border border-line-strong bg-surface p-3 ${ENTER_CLASS}`}
    >
      {withdraw.error && <ArchiveAlert>{withdraw.error}</ArchiveAlert>}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p
          id={promptId}
          className="text-[13px]/5 font-semibold wrap-anywhere text-fg"
        >
          Withdraw this request?
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="destructive"
            isPending={withdraw.isPending}
            pendingLabel={REQUEST_COPY.withdrawing}
            onClick={withdraw.handleConfirm}
          >
            Withdraw
          </Button>
          <Button
            autoFocus
            disabled={withdraw.isPending}
            onClick={withdraw.handleCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
