import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  getSyncFailure,
  PROJECT_ID_FIELD,
  PROJECTS_COPY,
  SYNC_NOW_INTENT,
  type SyncNowOutcome,
} from "@/lib/projects";
import { INTENT_FIELD } from "@/lib/link-board";
import { toast } from "@/lib/toast";

type SyncNowOptions = {
  projectId: string;
  projectName: string;
  // The Projects route the sync posts to.
  action: string;
  onSynced: (projectId: string) => void;
};

type SyncNow = {
  isSyncing: boolean;
  // The failed sync's alert line, until the next press.
  error: string | null;
  handleSync: () => void;
};

// One Project row's Sync now, on its own fetcher so two rows never share
// pending state. A success is handled once the page has revalidated, so the
// row shows its new time as it highlights.
export function useSyncNow({
  projectId,
  projectName,
  action,
  onSynced,
}: SyncNowOptions): SyncNow {
  const fetcher = useFetcher<SyncNowOutcome>();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef<SyncNowOutcome | undefined>(fetcher.data);
  const isSyncing = fetcher.state !== "idle";

  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "synced") {
      toast(PROJECTS_COPY.synced);
      onSynced(projectId);
    } else {
      setError(getSyncFailure(projectName, outcome));
    }
  }, [fetcher.data, fetcher.state, projectId, projectName, onSynced]);

  function handleSync(): void {
    if (isSyncing) return;

    setError(null);
    void fetcher.submit(
      { [INTENT_FIELD]: SYNC_NOW_INTENT, [PROJECT_ID_FIELD]: projectId },
      { method: "post", action },
    );
  }

  return { isSyncing, error, handleSync };
}
