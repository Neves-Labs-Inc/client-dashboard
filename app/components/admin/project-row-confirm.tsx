import { useId } from "react";
import { ArchiveAlert } from "@/components/admin/archive-confirm";
import Button from "@/components/ui/button";
import { getRemovePrompt, REMOVE_COPY } from "@/lib/project-row-copy";
import type { RemoveIntent } from "@/lib/projects";

const ENTER_CLASS =
  "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0";

type ProjectRowConfirmProps = {
  id: string;
  kind: RemoveIntent;
  projectName: string;
  // Linked or closed on GitHub: a delete returns the board to the pool.
  isLinked: boolean;
  clientName: string;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onKeep: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

// A Project row's inline Unlink or Delete confirm, across the row's full
// width: prompt over its buttons below md, side by side from md (as
// ArchiveConfirm).
export default function ProjectRowConfirm({
  id,
  kind,
  projectName,
  isLinked,
  clientName,
  isPending,
  error,
  onConfirm,
  onKeep,
  onKeyDown,
}: ProjectRowConfirmProps): React.ReactNode {
  const promptId = useId();
  const prompt = getRemovePrompt(
    kind,
    { name: projectName, isLinked },
    clientName,
  );
  const isUnlink = kind === "unlink";

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={promptId}
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-3 rounded-[3px] border border-line-strong bg-surface p-3 ${ENTER_CLASS}`}
    >
      {error && <ArchiveAlert>{error}</ArchiveAlert>}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p
          id={promptId}
          className="max-w-prose text-[13px]/5 wrap-anywhere text-fg"
        >
          <span className="font-semibold">{prompt.question}</span>{" "}
          {prompt.detail}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="destructive"
            isPending={isPending}
            pendingLabel={
              isUnlink ? REMOVE_COPY.unlinking : REMOVE_COPY.deleting
            }
            onClick={onConfirm}
          >
            {isUnlink ? REMOVE_COPY.unlink : REMOVE_COPY.delete}
          </Button>
          <Button autoFocus disabled={isPending} onClick={onKeep}>
            {REMOVE_COPY.keep}
          </Button>
        </div>
      </div>
    </div>
  );
}
