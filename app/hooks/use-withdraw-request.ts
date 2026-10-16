import { useEffect, useId, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
  REQUEST_COPY,
  REQUEST_INTENT_FIELD,
  type RequestOutcome,
} from "@/lib/request-outcome";

type WithdrawRequestOptions = {
  // The Request's route, which the withdraw posts to.
  action: string;
  onWithdrawn: () => void;
  onNoLongerNew: () => void;
};

export type WithdrawRequest = {
  isConfirming: boolean;
  // The confirm block's id, for the trigger's aria-controls.
  confirmId: string;
  isPending: boolean;
  // The confirm's alert line, or null.
  error: string | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  handleStart: () => void;
  handleCancel: () => void;
  handleConfirm: () => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

// Withdraw behind an inline confirm. An outcome is handled once the fetcher
// is idle again, so the page has revalidated into its new state first.
export function useWithdrawRequest({
  action,
  onWithdrawn,
  onNoLongerNew,
}: WithdrawRequestOptions): WithdrawRequest {
  const fetcher = useFetcher<RequestOutcome>();
  const revalidator = useRevalidator();
  const confirmId = useId();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef<RequestOutcome | undefined>(fetcher.data);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shouldFocusTriggerRef = useRef(false);
  // The latest callbacks, so the outcome effect needn't re-run on them.
  const callbacksRef = useRef({ onWithdrawn, onNoLongerNew });
  const isPending = fetcher.state !== "idle";

  useEffect(() => {
    callbacksRef.current = { onWithdrawn, onNoLongerNew };
  }, [onWithdrawn, onNoLongerNew]);

  // Cancel or Esc hands focus back to "Withdraw request".
  useEffect(() => {
    if (isConfirming || !shouldFocusTriggerRef.current) return;

    shouldFocusTriggerRef.current = false;
    triggerRef.current?.focus();
  }, [isConfirming]);

  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "withdrawn") {
      setIsConfirming(false);
      setError(null);
      callbacksRef.current.onWithdrawn();
    } else if (outcome.kind === "not-new") {
      // Shown in the confirm until the revalidated page drops the controls.
      setError(REQUEST_COPY.notNew);
      callbacksRef.current.onNoLongerNew();
      void revalidator.revalidate();
    } else {
      setError(REQUEST_COPY.withdrawFailed);
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  function handleStart(): void {
    setError(null);
    setIsConfirming(true);
  }

  function handleCancel(): void {
    if (isPending) return;

    shouldFocusTriggerRef.current = true;
    setError(null);
    setIsConfirming(false);
  }

  function handleConfirm(): void {
    if (isPending) return;

    setError(null);
    void fetcher.submit(
      { [REQUEST_INTENT_FIELD]: "withdraw" },
      { method: "post", action },
    );
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape") return;

    event.preventDefault();
    handleCancel();
  }

  return {
    isConfirming,
    confirmId,
    isPending,
    error,
    triggerRef,
    handleStart,
    handleCancel,
    handleConfirm,
    handleConfirmKeyDown,
  };
}
