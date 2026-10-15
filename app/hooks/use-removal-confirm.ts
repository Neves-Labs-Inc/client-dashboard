import { useCallback, useState } from "react";
import type { RowRemoval } from "@/hooks/use-project-row-removal";
import type { ProjectRow as Project } from "@/lib/board-sync/board-sync";
import type { RemoveIntent } from "@/lib/projects";

type OpenConfirm = { projectId: string; intent: RemoveIntent };

type RemovalConfirm = {
  notice: string | null;
  setNotice: (message: string | null) => void;
  getConfirming: (projectId: string) => RemoveIntent | null;
  // Another row's removal is running.
  isBusyElsewhere: (projectId: string) => boolean;
  handleBusyChange: (projectId: string, isBusy: boolean) => void;
  setConfirming: (projectId: string, intent: RemoveIntent | null) => void;
  handleRemoved: (projectId: string, removal: RowRemoval) => void;
};

// The panel's Unlink and Delete state: one confirm open at a time (opening
// another closes the first), and the notice under the header.
export function useRemovalConfirm(
  projects: Project[] | null,
  isArchived: boolean,
  highlight: (id: string) => void,
  panelTitleRef: React.RefObject<HTMLHeadingElement | null>,
): RemovalConfirm {
  const [open, setOpen] = useState<OpenConfirm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The row whose removal is running; one at a time, so its confirm can't
  // be closed by another row's.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wasArchived, setWasArchived] = useState(isArchived);
  // Unarchived: an "archived" notice no longer holds.
  if (wasArchived !== isArchived) {
    setWasArchived(isArchived);
    if (!isArchived) setNotice(null);
  }

  function getConfirming(projectId: string): RemoveIntent | null {
    // A deleted row's confirm leaves with it.
    const isOpen =
      open?.projectId === projectId &&
      (projects?.some((row) => row.id === projectId) ?? false);
    return isOpen ? open.intent : null;
  }

  function isBusyElsewhere(projectId: string): boolean {
    return busyId !== null && busyId !== projectId;
  }

  // Stable: row hooks list it in their effects' deps.
  const handleBusyChange = useCallback(
    (projectId: string, isBusy: boolean): void => {
      setBusyId((current) => {
        if (isBusy) return projectId;

        return current === projectId ? null : current;
      });
    },
    [],
  );

  function setConfirming(projectId: string, intent: RemoveIntent | null): void {
    if (isBusyElsewhere(projectId)) return;

    setOpen((current) => {
      if (intent !== null) return { projectId, intent };

      return current?.projectId === projectId ? null : current;
    });
  }

  // Stable: row hooks list it in their effects' deps. The row's trigger is
  // gone or moved, so focus goes to the panel title.
  const handleRemoved = useCallback(
    (projectId: string, removal: RowRemoval): void => {
      if (removal === "unlinked") highlight(projectId);
      panelTitleRef.current?.focus();
    },
    [highlight, panelTitleRef],
  );

  return {
    notice,
    setNotice,
    getConfirming,
    isBusyElsewhere,
    handleBusyChange,
    setConfirming,
    handleRemoved,
  };
}
