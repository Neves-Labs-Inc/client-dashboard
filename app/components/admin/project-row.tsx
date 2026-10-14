import { Columns3, ExternalLink } from "lucide-react";
import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/admin/projects-grid";
import SyncNowButton from "@/components/admin/sync-now-button";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import StatusIcon from "@/components/ui/status-icon";
import { useSyncNow } from "@/hooks/use-sync-now";
import type { ProjectRow as Project } from "@/lib/board-sync/board-sync";
import { getUnmappedLine, PROJECTS_COPY } from "@/lib/projects";
import { cn } from "@/lib/utils";

type ProjectRowProps = {
  project: Project;
  // Sync now: a linked or closed row of an active Client, GitHub connected.
  canSync: boolean;
  // The Projects route the row's actions post to.
  action: string;
  isHighlighted: boolean;
  onSynced: (projectId: string) => void;
};

// Not a linking row: only the name (to GitHub) and the actions act.
export default function ProjectRow({
  project,
  canSync,
  action,
  isHighlighted,
  onSynced,
}: ProjectRowProps): React.ReactNode {
  const sync = useSyncNow({
    projectId: project.id,
    projectName: project.name,
    action,
    onSynced,
  });
  const isUnlinked = project.state === "unlinked";
  const isActionable = canSync && !isUnlinked;
  // A fresh failure replaces the recorded one, so it isn't shown twice.
  const recordedError = sync.error === null ? project.lastSyncError : null;

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isHighlighted={isHighlighted}>
      <DataTableCell className={CELL_CLASS.name}>
        <a
          href={project.url}
          target="_blank"
          rel="noreferrer"
          className={cn(
            // Not transition-colors: it would fade the focus ring in from fg.
            // On touch a pseudo-element grows the hit area past 44px; it is
            // positioned, so the lines below can't cover it, and the focus
            // ring stays on the text.
            "relative text-sm/5 font-semibold wrap-anywhere transition-[color,text-decoration-color] duration-(--dur-instant) hover:text-accent-fg hover:underline pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3.5",
            isUnlinked ? "text-fg-2" : "text-fg",
          )}
        >
          {project.name}
          <span className="sr-only">, opens on GitHub</span>
          <ExternalLink
            size={12}
            aria-hidden="true"
            className="ml-1 inline align-baseline text-fg-2"
          />
        </a>
        {sync.error !== null && <ErrorLine isAlert>{sync.error}</ErrorLine>}
        {recordedError !== null && (
          <ErrorLine>Last sync failed: {recordedError}</ErrorLine>
        )}
        {project.unmappedCount > 0 && (
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs/4 text-fg-2">
            <Columns3 size={12} aria-hidden="true" className="shrink-0" />
            {getUnmappedLine(project.unmappedCount)}
          </p>
        )}
      </DataTableCell>
      <DataTableCell className={`${CELL_CLASS.state} text-[13px]/5`}>
        <StateText project={project} />
      </DataTableCell>
      <DataTableCell
        className={`${CELL_CLASS.synced} font-mono text-xs/4 md:text-[13px]/5`}
      >
        <SyncedText lastSyncedAt={project.lastSyncedAt} />
      </DataTableCell>
      {/* Kept when empty, so the grid holds from lg. */}
      <DataTableCell
        className={cn(CELL_CLASS.actions, !isActionable && "max-lg:sr-only")}
      >
        {isActionable && (
          <SyncNowButton isSyncing={sync.isSyncing} onSync={sync.handleSync} />
        )}
      </DataTableCell>
    </DataTableRow>
  );
}

function ErrorLine({
  isAlert = false,
  children,
}: {
  isAlert?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <p
      role={isAlert ? "alert" : undefined}
      className="mt-0.5 flex items-start gap-1.5 text-[13px]/5 wrap-anywhere text-fg"
    >
      <StatusIcon status="off" size={12} className="mt-1" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function StateText({ project }: { project: Project }): React.ReactNode {
  if (project.state === "linked")
    return <span className="text-fg">Linked</span>;
  if (project.state === "closed-on-github") {
    return <span className="text-fg-2">Closed on GitHub</span>;
  }

  return (
    <span className="text-fg-2">
      Unlinked{" "}
      {project.unlinkedAt !== null && <DateText date={project.unlinkedAt} />}
    </span>
  );
}

function SyncedText({
  lastSyncedAt,
}: {
  lastSyncedAt: Date | null;
}): React.ReactNode {
  if (lastSyncedAt === null) {
    return (
      <span className="text-fg-2">
        <span className="md:hidden">{PROJECTS_COPY.neverSynced}</span>
        <span className="max-md:hidden">{PROJECTS_COPY.never}</span>
      </span>
    );
  }

  return (
    <>
      <span className="text-fg-2 md:hidden">Synced </span>
      <DateText date={lastSyncedAt} withTime className="text-fg-2 md:text-fg" />
    </>
  );
}
