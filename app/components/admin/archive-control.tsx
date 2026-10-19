import { Archive, ArchiveRestore } from "lucide-react";
import ArchiveConfirm, {
  ArchiveAlert,
} from "@/components/admin/archive-confirm";
import Button from "@/components/ui/button";
import type { ArchiveClient } from "@/hooks/use-archive-client";
import { ARCHIVE_COPY } from "@/lib/team-archive";

type ArchiveVariant = "active" | "archived";

type ArchiveControlProps = {
  variant: ArchiveVariant;
  archive: ArchiveClient;
  // The primary action before "Archive client" (Invite first Owner).
  children?: React.ReactNode;
  // Shown for either variant, after the primary action and before "Archive
  // client" or "Unarchive" (Preview).
  secondaryAction?: React.ReactNode;
};

// The Team header's action group: an active Client's actions and "Archive
// client", or an archived Client's "Unarchive".
export default function ArchiveControl({
  variant,
  archive,
  children,
  secondaryAction,
}: ArchiveControlProps): React.ReactNode {
  return (
    // One line from md (the header's right column); wraps below it.
    <div className="flex flex-wrap gap-2 md:flex-nowrap">
      {variant === "active" ? (
        <>
          {children}
          {secondaryAction}
          <Button
            ref={archive.triggerRef}
            icon={Archive}
            className="whitespace-nowrap"
            disabled={archive.isBusy}
            aria-expanded={archive.isConfirming}
            aria-controls={archive.isConfirming ? archive.confirmId : undefined}
            onClick={archive.handleStartArchive}
          >
            {ARCHIVE_COPY.archiveClient}
          </Button>
        </>
      ) : (
        <>
          {secondaryAction}
          <Button
            variant="primary"
            icon={ArchiveRestore}
            className="whitespace-nowrap"
            isPending={archive.isUnarchiving}
            pendingLabel={ARCHIVE_COPY.unarchiving}
            onClick={archive.handleUnarchive}
          >
            {ARCHIVE_COPY.unarchive}
          </Button>
        </>
      )}
    </div>
  );
}

type ArchiveStatusProps = {
  variant: ArchiveVariant;
  clientName: string;
  archive: ArchiveClient;
};

// What opens under the header, before the tabs: the archive confirm, or a
// failed unarchive's alert line.
export function ArchiveStatus({
  variant,
  clientName,
  archive,
}: ArchiveStatusProps): React.ReactNode {
  let status: React.ReactNode = null;
  if (variant === "active" && archive.isConfirming) {
    status = (
      <ArchiveConfirm
        id={archive.confirmId}
        clientName={clientName}
        archive={archive}
      />
    );
  } else if (variant === "archived" && archive.error) {
    status = <ArchiveAlert>{archive.error}</ArchiveAlert>;
  }
  return status;
}
