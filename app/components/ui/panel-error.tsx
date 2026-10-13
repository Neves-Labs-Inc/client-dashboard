import { useRevalidator } from "react-router";
import Button from "@/components/ui/button";
import StatusIcon from "@/components/ui/status-icon";

type PanelErrorProps = {
  message: string;
  onRetry?: () => void;
};

export default function PanelError({
  message,
  onRetry,
}: PanelErrorProps): React.ReactNode {
  const revalidator = useRevalidator();
  const isPending = revalidator.state !== "idle";

  return (
    <div className="flex flex-col items-start gap-3 px-3 py-6">
      <div className="flex items-start gap-1.5 text-[13px]/5 text-fg">
        <StatusIcon status="off" size={16} className="mt-0.5" />
        <p>{message}</p>
      </div>
      <Button
        isPending={isPending}
        pendingLabel="Trying again…"
        onClick={onRetry ?? (() => void revalidator.revalidate())}
      >
        Try again
      </Button>
    </div>
  );
}
