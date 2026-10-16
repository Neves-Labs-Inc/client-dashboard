import StatusIcon from "@/components/ui/status-icon";
import { cn } from "@/lib/utils";

type SyncIssueLineProps = {
  // off: a sync error; risk: a sync warning.
  status: "off" | "risk";
  // A fresh failure, announced as it appears.
  isAlert?: boolean;
  className?: string;
  children: React.ReactNode;
};

export default function SyncIssueLine({
  status,
  isAlert = false,
  className,
  children,
}: SyncIssueLineProps): React.ReactNode {
  return (
    <p
      role={isAlert ? "alert" : undefined}
      className={cn(
        "flex items-start gap-1.5 text-[13px]/5 wrap-anywhere text-fg",
        className,
      )}
    >
      <StatusIcon status={status} size={12} className="mt-1" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
