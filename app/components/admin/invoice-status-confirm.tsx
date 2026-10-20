import { useId } from "react";
import { ArchiveAlert } from "@/components/admin/archive-confirm";
import Button from "@/components/ui/button";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import type { InvoiceStatusAction } from "@/hooks/use-invoice-status-action";
import {
  STATUS_COPY,
  STATUS_INTENT_COPY,
  type StatusIntent,
} from "@/lib/admin-invoice-status";
import type { IsoDate } from "@/lib/invoices/invoice-rules";
import { cn } from "@/lib/utils";

const ENTER_CLASS =
  "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0";

type InvoiceStatusConfirmProps = {
  intent: StatusIntent;
  number: string;
  // The paid date's native bounds; the module's copy is what shows.
  issueDate: IsoDate;
  today: IsoDate;
  status: InvoiceStatusAction;
};

function Prompt({
  id,
  intent,
  number,
}: {
  id: string;
  intent: StatusIntent;
  number: string;
}): React.ReactNode {
  const code = <span className="font-mono">{number}</span>;
  const detail = STATUS_INTENT_COPY[intent].detail;
  let question: React.ReactNode;
  if (intent === "paid") {
    question = <>Mark {code} paid?</>;
  } else if (intent === "revert") {
    question = <>Revert {code} to Open?</>;
  } else {
    question = <>Void {code}?</>;
  }
  return (
    <p id={id} className="text-[13px]/5 wrap-anywhere text-fg">
      <span className="font-semibold">{question}</span>
      {detail !== null && <> {detail}</>}
    </p>
  );
}

// The inline confirm under the detail's header, full width (as
// ArchiveConfirm). Mark paid stacks its prompt over the date and buttons;
// Revert and Void sit prompt beside buttons from md.
export default function InvoiceStatusConfirm({
  intent,
  number,
  issueDate,
  today,
  status,
}: InvoiceStatusConfirmProps): React.ReactNode {
  const promptId = useId();
  const copy = STATUS_INTENT_COPY[intent];
  const hasDate = intent === "paid";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    status.handleConfirm();
  }

  const buttons = (
    <div className="flex shrink-0 gap-2">
      <Button
        variant={intent === "void" ? "destructive" : "primary"}
        isPending={status.isPending}
        pendingLabel={copy.pending}
        // With a date, Enter in the field submits the form instead.
        type={hasDate ? "submit" : "button"}
        onClick={hasDate ? undefined : status.handleConfirm}
      >
        {copy.confirm}
      </Button>
      <Button
        autoFocus={!hasDate}
        disabled={status.isPending}
        onClick={status.handleCancel}
      >
        {STATUS_COPY.cancel}
      </Button>
    </div>
  );

  return (
    <div
      id={status.confirmId}
      role="group"
      aria-labelledby={promptId}
      onKeyDown={status.handleConfirmKeyDown}
      className={cn(
        "flex flex-col gap-3 rounded-[3px] border border-line-strong bg-surface p-3",
        ENTER_CLASS,
      )}
    >
      {status.error && <ArchiveAlert>{status.error}</ArchiveAlert>}
      {hasDate ? (
        // noValidate: the module's copy shows, not the browser's min/max
        // bubble.
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >
          <Prompt id={promptId} intent={intent} number={number} />
          {/* Top-aligned, the buttons pushed down past the label: bottom
              alignment would drop them to a field error's last line. */}
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="md:w-44">
              <Field
                label={STATUS_COPY.paidOn}
                error={status.fieldError ?? undefined}
              >
                {(control) => (
                  <Input
                    {...control}
                    ref={status.paidDateRef}
                    type="date"
                    // Focused on open, as the confirm's first control.
                    autoFocus
                    min={issueDate}
                    max={today}
                    value={status.paidDate}
                    // Read-only, not disabled: Enter submits from here, and a
                    // disabled input would drop focus to <body>.
                    readOnly={status.isPending}
                    aria-disabled={status.isPending || undefined}
                    onChange={status.handlePaidDateChange}
                  />
                )}
              </Field>
            </div>
            <div className="md:mt-6.5 md:pointer-coarse:mt-6">{buttons}</div>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Prompt id={promptId} intent={intent} number={number} />
          {buttons}
        </div>
      )}
    </div>
  );
}
