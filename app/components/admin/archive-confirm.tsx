import { useId } from "react";
import Button from "@/components/ui/button";
import StatusIcon from "@/components/ui/status-icon";
import type { ArchiveClient } from "@/hooks/use-archive-client";
import { ARCHIVE_COPY, getArchivePrompt } from "@/lib/team-archive";

const ENTER_CLASS =
  "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0";

type ArchiveConfirmProps = {
  id: string;
  clientName: string;
  archive: ArchiveClient;
};

// The inline confirm under the Team header: full width, before the tabs.
// Prompt over its buttons below md, side by side from md.
export default function ArchiveConfirm({
  id,
  clientName,
  archive,
}: ArchiveConfirmProps): React.ReactNode {
  const promptId = useId();
  const prompt = getArchivePrompt(clientName);

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={promptId}
      onKeyDown={archive.handleConfirmKeyDown}
      className={`flex flex-col gap-3 rounded-[3px] border border-line-strong bg-surface p-3 ${ENTER_CLASS}`}
    >
      {archive.error && <ArchiveAlert>{archive.error}</ArchiveAlert>}
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
            isPending={archive.isArchiving}
            pendingLabel={ARCHIVE_COPY.archiving}
            onClick={archive.handleArchive}
          >
            {ARCHIVE_COPY.archive}
          </Button>
          <Button
            autoFocus
            disabled={archive.isBusy}
            onClick={archive.handleKeep}
          >
            {ARCHIVE_COPY.keep}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ArchiveAlertProps = {
  children: React.ReactNode;
};

// A failed archive (in the confirm) or unarchive (under the header).
export function ArchiveAlert({ children }: ArchiveAlertProps): React.ReactNode {
  return (
    <div
      role="alert"
      className={`flex items-start gap-1.5 text-[13px]/5 text-fg ${ENTER_CLASS}`}
    >
      <StatusIcon status="off" className="mt-1" />
      <p className="wrap-anywhere">{children}</p>
    </div>
  );
}
