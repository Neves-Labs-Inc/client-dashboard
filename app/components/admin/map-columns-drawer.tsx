import { useEffect, useId, useRef } from "react";
import ColumnMappingList, {
  ColumnMappingHelp,
} from "@/components/admin/column-mapping-list";
import ColumnMappingSkeleton from "@/components/admin/column-mapping-skeleton";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import { useMapColumnsForm } from "@/hooks/use-map-columns-form";
import type {
  MappingEdit,
  SaveMappingError,
} from "@/lib/board-sync/board-sync";
import { MAP_COPY } from "@/lib/projects";

const DIRTY_CONFIRM = {
  message: MAP_COPY.discard,
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

const REFUSAL_COPY: Record<SaveMappingError, string> = {
  unlinked: MAP_COPY.unlinked,
  archived: MAP_COPY.archived,
  "not-found": MAP_COPY.notFound,
};

type MapColumnsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The Project shown, kept while the drawer animates out.
  projectId: string | null;
  // The row's name, for the title until the mapping loads.
  projectName: string | null;
  // Undefined while loading; null when the Project isn't on this Client;
  // "failed" when it couldn't load.
  mapping: MappingEdit | null | "failed" | undefined;
  // Why the Project can't be mapped any more, from its row.
  unavailable: SaveMappingError | null;
  // The Projects route the mapping posts to.
  action: string;
  onSaved: (projectId: string) => void;
  // Where focus lands on close when the row has no Map columns button (a
  // deep link to an unlinked Project).
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
};

export default function MapColumnsDrawer({
  open,
  onOpenChange,
  projectId,
  projectName,
  mapping,
  unavailable,
  action,
  onSaved,
  fallbackFocusRef,
}: MapColumnsDrawerProps): React.ReactNode {
  const formId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const form = useMapColumnsForm({ projectId, mapping, action, onSaved });
  const isLoading = mapping === undefined;
  const loaded = typeof mapping === "object" ? mapping : null;
  const refusal =
    unavailable ?? (mapping === null ? "not-found" : form.refusal);
  const isBlocked = refusal !== null || mapping === "failed";
  const hasOptions = loaded !== null && loaded.options.length > 0;
  const canSave = hasOptions && !isBlocked;
  const error = getError(mapping, unavailable, form.banner);

  // Focus the first select once the options are in; with none to edit (or
  // a refusal), Close is all that's left to do.
  useEffect(() => {
    if (!open || isLoading) return;

    // A frame later: on a deep link the dialog mounts after this effect,
    // and its own autofocus would otherwise win.
    const frame = requestAnimationFrame(() => {
      const select = listRef.current?.querySelector("select");
      (canSave ? select : closeRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, isLoading, canSave]);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={getTitle(loaded?.projectName ?? projectName)}
      error={error}
      isDirty={form.isDirty && !isBlocked}
      dirtyConfirm={DIRTY_CONFIRM}
      getReturnFocusTarget={() =>
        findMapTrigger(projectId) ?? fallbackFocusRef.current
      }
      footer={({ requestClose }) => (
        <>
          <Button ref={closeRef} onClick={requestClose}>
            {canSave || isLoading ? "Cancel" : "Close"}
          </Button>
          {(canSave || isLoading) && (
            <Button
              variant="primary"
              type="submit"
              form={formId}
              disabled={isLoading}
              isPending={form.isPending}
              pendingLabel={MAP_COPY.saving}
            >
              {MAP_COPY.save}
            </Button>
          )}
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={form.handleSubmit}>
        <div ref={listRef}>
          {isLoading && (
            <>
              <ColumnMappingHelp />
              <ColumnMappingSkeleton />
            </>
          )}
          {loaded !== null && unavailable === null && (
            <ColumnMappingList
              options={loaded.options}
              mapping={form.values}
              onChange={form.handleChange}
              disabled={form.refusal !== null || form.isPending}
            />
          )}
        </div>
      </form>
    </Drawer>
  );
}

function getTitle(projectName: string | null | undefined): string {
  return projectName ? `${MAP_COPY.title} · ${projectName}` : MAP_COPY.title;
}

// A load failure or a stale link comes before the last save's failure.
function getError(
  mapping: MapColumnsDrawerProps["mapping"],
  unavailable: SaveMappingError | null,
  saveFailure: string | null,
): string | null {
  if (mapping === "failed") return MAP_COPY.loadFailed;
  if (unavailable !== null) return REFUSAL_COPY[unavailable];
  if (mapping === null) return REFUSAL_COPY["not-found"];

  return saveFailure;
}

// The row's Map columns, found at close time: a revalidation may have
// re-rendered it.
function findMapTrigger(projectId: string | null): HTMLElement | null {
  if (projectId === null) return null;

  return document.querySelector<HTMLElement>(
    `[data-map-trigger="${CSS.escape(projectId)}"]`,
  );
}
