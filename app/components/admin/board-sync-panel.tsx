import { Columns3 } from "lucide-react";
import { FACT_ROW_CLASS } from "@/components/admin/admin-requests-grid";
import SyncIssueLine from "@/components/admin/sync-issue-line";
import SyncProblemLine from "@/components/admin/sync-problem-line";
import SyncNowButton from "@/components/admin/sync-now-button";
import DateText from "@/components/ui/date-text";
import Panel from "@/components/ui/panel";
import type { SyncNow } from "@/hooks/use-sync-now";
import { BOARD_DETAIL_COPY, getWarningLine } from "@/lib/board-detail";
import type { BoardDetail } from "@/lib/board-sync/board-sync";
import { getSyncProblemReason, getUnmappedLine } from "@/lib/projects";
import { cn } from "@/lib/utils";

type BoardSyncPanelProps = {
  detail: BoardDetail;
  sync: SyncNow;
  // Sync now: a linked or closed board of an active Client, GitHub
  // connected.
  canSync: boolean;
  // The loader's clock, so server and client agree at the 26h edge.
  nowMs: number;
  isSyncedHighlighted: boolean;
};

export default function BoardSyncPanel({
  detail,
  sync,
  canSync,
  nowMs,
  isSyncedHighlighted,
}: BoardSyncPanelProps): React.ReactNode {
  // A fresh failure replaces the recorded one, so it isn't shown twice.
  const recordedError = sync.error === null ? detail.lastSyncError : null;
  const syncProblem = getSyncProblemReason(
    { ...detail, clientArchived: detail.isClientArchived },
    new Date(nowMs),
  );
  const hasIssues =
    syncProblem !== null ||
    sync.error !== null ||
    recordedError !== null ||
    detail.syncWarnings.length > 0;

  return (
    <Panel
      title="Sync"
      action={
        canSync && (
          <SyncNowButton isSyncing={sync.isSyncing} onSync={sync.handleSync} />
        )
      }
    >
      {hasIssues && (
        <div className="flex flex-col gap-1 border-b border-line px-3 py-2">
          {syncProblem !== null && <SyncProblemLine reason={syncProblem} />}
          {sync.error !== null && (
            <SyncIssueLine status="off" isAlert>
              {sync.error}
            </SyncIssueLine>
          )}
          {recordedError !== null && (
            <SyncIssueLine status="off">
              Last sync failed: {recordedError}
            </SyncIssueLine>
          )}
          {detail.syncWarnings.map((warning) => {
            const line = getWarningLine(warning);
            return (
              <SyncIssueLine key={line} status="risk">
                {line}
              </SyncIssueLine>
            );
          })}
        </div>
      )}
      <dl>
        <div className={FACT_ROW_CLASS}>
          <dt className="text-fg-2">State</dt>
          <dd className="text-fg">
            <StateText detail={detail} />
          </dd>
        </div>
        <div
          className={cn(
            FACT_ROW_CLASS,
            isSyncedHighlighted && "animate-row-highlight",
          )}
        >
          <dt className="text-fg-2">Last synced</dt>
          <dd className="text-fg">
            {detail.lastSyncedAt === null ? (
              <span className="text-fg-2">{BOARD_DETAIL_COPY.never}</span>
            ) : (
              <DateText date={detail.lastSyncedAt} withTime />
            )}
          </dd>
        </div>
        {detail.unmappedCount > 0 && (
          <div className={FACT_ROW_CLASS}>
            <dt className="text-fg-2">Unmapped</dt>
            <dd className="flex items-center gap-1.5 font-mono text-xs/5 text-fg-2">
              <Columns3 size={12} aria-hidden="true" className="shrink-0" />
              {getUnmappedLine(detail.unmappedCount)}
            </dd>
          </div>
        )}
      </dl>
    </Panel>
  );
}

function StateText({ detail }: { detail: BoardDetail }): React.ReactNode {
  if (detail.state === "linked") return "Linked";
  if (detail.state === "closed-on-github") return "Closed on GitHub";

  return (
    <>
      Unlinked{" "}
      {detail.unlinkedAt !== null && <DateText date={detail.unlinkedAt} />}
    </>
  );
}
