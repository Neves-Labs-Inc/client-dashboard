import { Columns3 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import ProjectRowActions from "@/components/admin/project-row-actions";
import ProjectRowConfirm from "@/components/admin/project-row-confirm";
import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/admin/projects-grid";
import SyncIssueLine from "@/components/admin/sync-issue-line";
import SyncProblemLine from "@/components/admin/sync-problem-line";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import {
  useProjectRowRemoval,
  type RowRemoval,
} from "@/hooks/use-project-row-removal";
import { useSyncNow } from "@/hooks/use-sync-now";
import { getBoardPath } from "@/lib/board-detail";
import type { ProjectRow as Project } from "@/lib/board-sync/board-sync";
import {
  getSyncProblemReason,
  getUnmappedLine,
  PROJECTS_COPY,
  type RemoveIntent,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type ProjectRowProps = {
  project: Project;
  // Sync now: a linked or closed row of an active Client, GitHub connected.
  canSync: boolean;
  // Map columns: a linked or closed row of an active Client. Nothing calls
  // GitHub, so it needn't be connected.
  canMap: boolean;
  // Unlink and Delete: a row of an active Client. Both are database-only.
  canRemove: boolean;
  isClientArchived: boolean;
  // The loader's clock, so server and client agree at the 26h edge.
  nowMs: number;
  clientName: string;
  clientId: string;
  // Back from this row's board detail: its name link takes focus once.
  shouldFocusName: boolean;
  // The Projects route the row's actions post to.
  action: string;
  isHighlighted: boolean;
  // This row's open Unlink or Delete confirm; one per panel.
  confirming: RemoveIntent | null;
  // Another row's removal is running: this row's Unlink and Delete wait.
  isPanelBusy: boolean;
  onBusyChange: (projectId: string, isBusy: boolean) => void;
  onConfirmingChange: (intent: RemoveIntent | null) => void;
  onNotice: (message: string | null) => void;
  onRemoved: (projectId: string, removal: RowRemoval) => void;
  onSynced: (projectId: string) => void;
};

// Not a linking row: only the name (to the board detail) and the actions
// act.
export default function ProjectRow({
  project,
  canSync,
  canMap,
  canRemove,
  isClientArchived,
  nowMs,
  clientName,
  clientId,
  shouldFocusName,
  action,
  isHighlighted,
  confirming,
  isPanelBusy,
  onBusyChange,
  onConfirmingChange,
  onNotice,
  onRemoved,
  onSynced,
}: ProjectRowProps): React.ReactNode {
  const sync = useSyncNow({
    projectId: project.id,
    projectName: project.name,
    action,
    onSynced,
  });
  const removal = useProjectRowRemoval({
    projectId: project.id,
    projectName: project.name,
    action,
    confirming,
    isPanelBusy,
    onBusyChange,
    onConfirmingChange,
    onNotice,
    onRemoved,
  });
  const nameRef = useRef<HTMLAnchorElement>(null);
  const isUnlinked = project.state === "unlinked";
  const canSyncRow = canSync && !isUnlinked;
  const canMapRow = canMap && !isUnlinked;
  const canUnlinkRow = canRemove && !isUnlinked;
  const hasActions = canSyncRow || canMapRow || canRemove;
  // A fresh failure replaces the recorded one, so it isn't shown twice.
  const recordedError = sync.error === null ? project.lastSyncError : null;
  const syncProblem = getSyncProblemReason(
    { ...project, clientArchived: isClientArchived },
    new Date(nowMs),
  );

  useEffect(() => {
    if (shouldFocusName) nameRef.current?.focus();
  }, [shouldFocusName]);

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isHighlighted={isHighlighted}>
      <DataTableCell className={CELL_CLASS.name}>
        <Link
          ref={nameRef}
          to={getBoardPath(clientId, project.id)}
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
        </Link>
        {syncProblem !== null && (
          <SyncProblemLine reason={syncProblem} className="mt-0.5" />
        )}
        {sync.error !== null && (
          <SyncIssueLine status="off" isAlert className="mt-0.5">
            {sync.error}
          </SyncIssueLine>
        )}
        {recordedError !== null && (
          <SyncIssueLine status="off" className="mt-0.5">
            Last sync failed: {recordedError}
          </SyncIssueLine>
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
        className={cn(CELL_CLASS.actions, !hasActions && "max-lg:sr-only")}
      >
        <ProjectRowActions
          projectId={project.id}
          projectName={project.name}
          canMap={canMapRow}
          canSync={canSyncRow}
          canUnlink={canUnlinkRow}
          canDelete={canRemove}
          confirming={confirming}
          isPanelBusy={isPanelBusy}
          sync={sync}
          removal={removal}
        />
      </DataTableCell>
      {canRemove && confirming !== null && (
        <DataTableCell className={CELL_CLASS.confirm}>
          {/* Keyed, so swapping Unlink and Delete focuses the new Keep. */}
          <ProjectRowConfirm
            key={confirming}
            id={removal.confirmId}
            kind={confirming}
            projectName={project.name}
            isLinked={!isUnlinked}
            clientName={clientName}
            isPending={removal.isBusy}
            error={removal.error}
            onConfirm={removal.handleConfirm}
            onKeep={removal.handleKeep}
            onKeyDown={removal.handleConfirmKeyDown}
          />
        </DataTableCell>
      )}
    </DataTableRow>
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
