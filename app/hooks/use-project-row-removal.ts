import { useEffect, useId, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { INTENT_FIELD } from "@/lib/link-board";
import { getRemoveFailure, REMOVE_COPY } from "@/lib/project-row-copy";
import {
  PROJECT_ID_FIELD,
  type RemoveIntent,
  type RemoveOutcome,
} from "@/lib/projects";
import { toast } from "@/lib/toast";

// Unlinked: the row moves. Gone: deleted or found gone, the row leaves.
// Archived: the row's actions go away.
export type RowRemoval = "unlinked" | "gone" | "archived";

type ProjectRowRemovalOptions = {
  projectId: string;
  projectName: string;
  // The Projects route the unlink and delete post to.
  action: string;
  // This row's open confirm; the panel keeps one open at a time.
  confirming: RemoveIntent | null;
  // Another row's removal is running: this row's can't start.
  isPanelBusy: boolean;
  onBusyChange: (projectId: string, isBusy: boolean) => void;
  onConfirmingChange: (intent: RemoveIntent | null) => void;
  // A message for the panel's notice; null clears it.
  onNotice: (message: string | null) => void;
  // Focus leaves the row: its trigger moved, left or went away.
  onRemoved: (projectId: string, removal: RowRemoval) => void;
};

export type ProjectRowRemoval = {
  isBusy: boolean;
  // The open confirm's alert line, until the next press.
  error: string | null;
  confirmId: string;
  unlinkRef: React.RefObject<HTMLButtonElement | null>;
  deleteRef: React.RefObject<HTMLButtonElement | null>;
  handleStart: (intent: RemoveIntent) => void;
  handleKeep: () => void;
  handleConfirm: () => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

// One Project row's Unlink and Delete, on its own fetcher so two rows never
// share pending state. Pending lasts through the revalidation, so the
// confirm never flashes back to idle before the row moves or leaves.
export function useProjectRowRemoval({
  projectId,
  projectName,
  action,
  confirming,
  isPanelBusy,
  onBusyChange,
  onConfirmingChange,
  onNotice,
  onRemoved,
}: ProjectRowRemovalOptions): ProjectRowRemoval {
  const fetcher = useFetcher<RemoveOutcome>();
  const revalidator = useRevalidator();
  const confirmId = useId();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef<RemoveOutcome | undefined>(fetcher.data);
  const intentRef = useRef<RemoveIntent>("unlink");
  const unlinkRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const focusOnCloseRef = useRef<RemoveIntent | null>(null);
  // Found already deleted, or the Client archived: the row stays busy until
  // the revalidation lands (dropping the row or its actions), so a press
  // can't post again or clear the panel's notice.
  const [isSettling, setIsSettling] = useState(false);
  const isBusy = fetcher.state !== "idle" || isSettling;

  // The panel blocks other rows' removals while this one runs.
  useEffect(() => {
    onBusyChange(projectId, isBusy);
  }, [isBusy, projectId, onBusyChange]);

  useEffect(
    () => () => onBusyChange(projectId, false),
    [projectId, onBusyChange],
  );

  // Keep or Esc hands focus back to the trigger that opened the confirm.
  useEffect(() => {
    const intent = focusOnCloseRef.current;
    if (confirming !== null || intent === null) return;

    focusOnCloseRef.current = null;
    (intent === "unlink" ? unlinkRef : deleteRef).current?.focus();
  }, [confirming]);

  // Each outcome is handled once. An unlink waits for the revalidation, so
  // the row has moved to the unlinked group; a delete can't wait, as its
  // row unmounts with it.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state === "submitting" || !outcome) return;
    if (outcome === handledRef.current) return;
    if (outcome.kind === "unlinked" && fetcher.state !== "idle") return;

    handledRef.current = outcome;
    const intent = intentRef.current;
    const refusal = outcome.kind === "refused" ? outcome.error : null;
    if (outcome.kind === "unlinked") {
      toast(REMOVE_COPY.unlinked);
      onConfirmingChange(null);
      onRemoved(projectId, "unlinked");
    } else if (outcome.kind === "deleted") {
      toast(REMOVE_COPY.deleted);
      onRemoved(projectId, "gone");
    } else if (refusal === "not-found" && intent === "delete") {
      // Already deleted in another tab: the same end state.
      setIsSettling(true);
      toast(REMOVE_COPY.deleted);
      onRemoved(projectId, "gone");
      // Cleared when the revalidation settles, failed or not; the loading
      // state may never commit.
      void revalidator.revalidate().finally(() => setIsSettling(false));
    } else if (refusal === "not-found") {
      onConfirmingChange(null);
      onNotice(REMOVE_COPY.notFound);
      onRemoved(projectId, "gone");
      void revalidator.revalidate();
    } else if (refusal === "archived") {
      // The row's actions (and the confirm) go away on revalidation, so the
      // message goes to the panel and focus to its title.
      setIsSettling(true);
      onConfirmingChange(null);
      onNotice(REMOVE_COPY.archived);
      onRemoved(projectId, "archived");
      void revalidator.revalidate().finally(() => setIsSettling(false));
    } else {
      // The confirm stays open, focus on its primary button.
      setError(getRemoveFailure(intent, projectName));
    }
  }, [
    fetcher.data,
    fetcher.state,
    projectId,
    projectName,
    onConfirmingChange,
    onNotice,
    onRemoved,
    revalidator,
  ]);

  function handleStart(intent: RemoveIntent): void {
    if (isBusy || isPanelBusy || confirming === intent) return;

    setError(null);
    onNotice(null);
    onConfirmingChange(intent);
  }

  function handleKeep(): void {
    if (isBusy) return;

    focusOnCloseRef.current = confirming;
    setError(null);
    onConfirmingChange(null);
  }

  function handleConfirm(): void {
    if (isBusy || confirming === null) return;

    intentRef.current = confirming;
    setError(null);
    onNotice(null);
    void fetcher.submit(
      { [INTENT_FIELD]: confirming, [PROJECT_ID_FIELD]: projectId },
      { method: "post", action },
    );
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape" || isBusy) return;

    event.preventDefault();
    handleKeep();
  }

  return {
    isBusy,
    error,
    confirmId,
    unlinkRef,
    deleteRef,
    handleStart,
    handleKeep,
    handleConfirm,
    handleConfirmKeyDown,
  };
}
