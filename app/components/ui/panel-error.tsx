import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import Button from "@/components/ui/button";
import StatusIcon from "@/components/ui/status-icon";

type PanelErrorProps = {
  message: string;
  onRetry?: () => void;
  // What takes focus when a retry succeeds and this error (with its focused
  // "Try again") unmounts, so focus doesn't drop to <body>: read then, as
  // the panel may have rendered something else (or nothing) in its place.
  getReturnFocusTarget?: () => HTMLElement | null;
};

export default function PanelError({
  message,
  onRetry,
  getReturnFocusTarget,
}: PanelErrorProps): React.ReactNode {
  const revalidator = useRevalidator();
  const isPending = revalidator.state !== "idle";
  const hasRetriedRef = useRef(false);
  // The latest callback, for the unmount cleanup.
  const getTargetRef = useRef(getReturnFocusTarget);

  useEffect(() => {
    getTargetRef.current = getReturnFocusTarget;
  }, [getReturnFocusTarget]);

  useEffect(
    () => () => {
      const isFocusLost =
        document.activeElement === null ||
        document.activeElement === document.body;
      if (!hasRetriedRef.current || !isFocusLost) return;

      getTargetRef.current?.()?.focus();
    },
    [],
  );

  function handleRetry(): void {
    hasRetriedRef.current = true;
    if (onRetry) {
      onRetry();
    } else {
      void revalidator.revalidate();
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 px-3 py-6">
      <div className="flex items-start gap-1.5 text-[13px]/5 text-fg">
        <StatusIcon status="off" size={16} className="mt-0.5" />
        <p>{message}</p>
      </div>
      <Button
        isPending={isPending}
        pendingLabel="Trying again…"
        onClick={handleRetry}
      >
        Try again
      </Button>
    </div>
  );
}
