import { RefreshCw } from "lucide-react";
import Button from "@/components/ui/button";
import { PROJECTS_COPY } from "@/lib/projects";

type SyncNowButtonProps = {
  isSyncing: boolean;
  onSync: () => void;
};

// Pending keeps focus on the button (aria-disabled, not disabled) and its
// width (both labels share one cell); the spinner replaces the icon.
export default function SyncNowButton({
  isSyncing,
  onSync,
}: SyncNowButtonProps): React.ReactNode {
  return (
    <Button
      icon={RefreshCw}
      className="whitespace-nowrap"
      isPending={isSyncing}
      pendingLabel={PROJECTS_COPY.syncing}
      onClick={onSync}
    >
      {PROJECTS_COPY.syncNow}
    </Button>
  );
}
