import { useEffect, useId, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
  getRefusalCopy,
  PAID_DATE_FIELD,
  STATUS_INTENT_COPY,
  STATUS_INTENT_FIELD,
  type StatusChangeOutcome,
  type StatusIntent,
} from "@/lib/admin-invoice-status";
import { type IsoDate, validatePaidDate } from "@/lib/invoices/invoice-rules";

type InvoiceStatusActionOptions = {
  // The Invoice's detail route, which the changes post to.
  action: string;
  issueDate: IsoDate;
  today: IsoDate;
  onChanged: (intent: StatusIntent) => void;
  // A stale refusal: the banner shows and the page revalidates.
  onRefused: () => void;
};

export type InvoiceStatusAction = {
  // The one open confirm, or null.
  openIntent: StatusIntent | null;
  // The confirm block's id, for its trigger's aria-controls.
  confirmId: string;
  isPending: boolean;
  // The confirm's alert line (a failed request), or null.
  error: string | null;
  // The paid date's field copy, or null.
  fieldError: string | null;
  // The stale-state banner under the header, or null.
  refusal: string | null;
  paidDate: string;
  paidDateRef: React.RefObject<HTMLInputElement | null>;
  triggerRefs: Record<StatusIntent, React.RefObject<HTMLButtonElement | null>>;
  handleStart: (intent: StatusIntent) => void;
  handleCancel: () => void;
  handleConfirm: () => void;
  handlePaidDateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

// Mark paid, Revert to Open and Void, one inline confirm at a time. An
// outcome is handled once the fetcher is idle again, so the page has
// revalidated into its new status first.
export function useInvoiceStatusAction({
  action,
  issueDate,
  today,
  onChanged,
  onRefused,
}: InvoiceStatusActionOptions): InvoiceStatusAction {
  const fetcher = useFetcher<StatusChangeOutcome>();
  const revalidator = useRevalidator();
  const confirmId = useId();
  const [openIntent, setOpenIntent] = useState<StatusIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState(today);
  const handledRef = useRef<StatusChangeOutcome | undefined>(fetcher.data);
  const paidDateRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLButtonElement>(null);
  const revertRef = useRef<HTMLButtonElement>(null);
  const voidRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = { paid: paidRef, revert: revertRef, void: voidRef };
  // The trigger Cancel or Esc hands focus back to.
  const returnFocusRef = useRef<StatusIntent | null>(null);
  // What the in-flight (or last) request asked for, for its failure copy.
  const submittedRef = useRef<StatusIntent>("paid");
  // The latest callbacks, so the outcome effect needn't re-run on them.
  const callbacksRef = useRef({ onChanged, onRefused });
  const isPending = fetcher.state !== "idle";

  useEffect(() => {
    callbacksRef.current = { onChanged, onRefused };
  }, [onChanged, onRefused]);

  useEffect(() => {
    const intent = returnFocusRef.current;
    if (openIntent !== null || intent === null) return;

    returnFocusRef.current = null;
    // Literal refs: the trigger map is rebuilt every render.
    const triggers = { paid: paidRef, revert: revertRef, void: voidRef };
    triggers[intent].current?.focus();
  }, [openIntent]);

  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "changed") {
      setOpenIntent(null);
      callbacksRef.current.onChanged(outcome.intent);
    } else if (outcome.kind === "invalid") {
      setFieldError(outcome.fieldErrors[PAID_DATE_FIELD] ?? null);
      paidDateRef.current?.focus();
    } else if (outcome.kind === "refused") {
      // Stays until navigation, past the revalidate that swaps the triggers.
      setRefusal(getRefusalCopy(outcome.intent, outcome.error));
      setOpenIntent(null);
      callbacksRef.current.onRefused();
      void revalidator.revalidate();
    } else {
      setError(STATUS_INTENT_COPY[submittedRef.current].failed);
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  function handleStart(intent: StatusIntent): void {
    if (isPending) return;

    setError(null);
    setFieldError(null);
    setRefusal(null);
    setPaidDate(today);
    setOpenIntent(intent);
  }

  function handleCancel(): void {
    if (isPending) return;

    returnFocusRef.current = openIntent;
    setError(null);
    setFieldError(null);
    setOpenIntent(null);
  }

  function handleConfirm(): void {
    if (isPending || openIntent === null) return;

    // The module's own check, so a bad date never makes the round trip;
    // the server checks it again.
    const message =
      openIntent === "paid"
        ? validatePaidDate(paidDate, issueDate, today)
        : null;
    setError(null);
    setFieldError(message);
    if (message === null) {
      submittedRef.current = openIntent;
      void fetcher.submit(
        { [STATUS_INTENT_FIELD]: openIntent, [PAID_DATE_FIELD]: paidDate },
        { method: "post", action },
      );
    } else {
      paidDateRef.current?.focus();
    }
  }

  function handlePaidDateChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    setPaidDate(event.target.value);
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape") return;

    event.preventDefault();
    handleCancel();
  }

  return {
    openIntent,
    confirmId,
    isPending,
    error,
    fieldError,
    refusal,
    paidDate,
    paidDateRef,
    triggerRefs,
    handleStart,
    handleCancel,
    handleConfirm,
    handlePaidDateChange,
    handleConfirmKeyDown,
  };
}
