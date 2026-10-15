import { Trash2, Unlink } from "lucide-react";
import MapColumnsButton from "@/components/admin/map-columns-button";
import SyncNowButton from "@/components/admin/sync-now-button";
import Button from "@/components/ui/button";
import type { ProjectRowRemoval } from "@/hooks/use-project-row-removal";
import type { SyncNow } from "@/hooks/use-sync-now";
import { REMOVE_COPY } from "@/lib/project-row-copy";
import type { RemoveIntent } from "@/lib/projects";

type ProjectRowActionsProps = {
  projectId: string;
  projectName: string;
  canMap: boolean;
  canSync: boolean;
  canUnlink: boolean;
  canDelete: boolean;
  confirming: RemoveIntent | null;
  // Another row's removal is running.
  isPanelBusy: boolean;
  sync: SyncNow;
  removal: ProjectRowRemoval;
};

// A Project row's buttons: a 2-column grid below md (each 44px), then
// right-aligned and wrapping 2×2 in a capped cell, on one line from xl.
// While one action runs, the others wait.
export default function ProjectRowActions({
  projectId,
  projectName,
  canMap,
  canSync,
  canUnlink,
  canDelete,
  confirming,
  isPanelBusy,
  sync,
  removal,
}: ProjectRowActionsProps): React.ReactNode {
  const isRemoving = removal.isBusy;
  const isRemoveDisabled = isRemoving || isPanelBusy || sync.isSyncing;

  return (
    <div className="grid grid-cols-2 gap-2 *:w-full md:flex md:max-w-60 md:flex-wrap md:justify-end md:*:w-auto xl:max-w-none xl:flex-nowrap">
      {canMap && (
        <MapColumnsButton
          projectId={projectId}
          projectName={projectName}
          isDisabled={isRemoving}
        />
      )}
      {canSync && (
        <SyncNowButton
          isSyncing={sync.isSyncing}
          disabled={isRemoving}
          onSync={sync.handleSync}
        />
      )}
      {canUnlink && (
        <Button
          ref={removal.unlinkRef}
          icon={Unlink}
          className="whitespace-nowrap"
          disabled={isRemoveDisabled}
          aria-expanded={confirming === "unlink"}
          aria-controls={
            confirming === "unlink" ? removal.confirmId : undefined
          }
          onClick={() => removal.handleStart("unlink")}
        >
          {REMOVE_COPY.unlink}
        </Button>
      )}
      {canDelete && (
        <Button
          ref={removal.deleteRef}
          variant="destructive"
          icon={Trash2}
          className="whitespace-nowrap"
          disabled={isRemoveDisabled}
          aria-expanded={confirming === "delete"}
          aria-controls={
            confirming === "delete" ? removal.confirmId : undefined
          }
          onClick={() => removal.handleStart("delete")}
        >
          {REMOVE_COPY.delete}
        </Button>
      )}
    </div>
  );
}
