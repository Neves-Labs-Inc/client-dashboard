import SyncIssueLine from "@/components/admin/sync-issue-line";
import { SYNC_PROBLEM_COPY, type SyncProblemReason } from "@/lib/projects";

type SyncProblemLineProps = {
  reason: SyncProblemReason;
  className?: string;
};

// Loaded state, not a fresh failure, so it isn't an alert.
export default function SyncProblemLine({
  reason,
  className,
}: SyncProblemLineProps): React.ReactNode {
  return (
    <SyncIssueLine status="off" className={className}>
      {SYNC_PROBLEM_COPY[reason]}
    </SyncIssueLine>
  );
}
