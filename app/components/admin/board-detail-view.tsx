import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import BoardBackLink from "@/components/admin/board-back-link";
import BoardDetailHeader from "@/components/admin/board-detail-header";
import BoardMilestonesPanel from "@/components/admin/board-milestones-panel";
import BoardRequiredFieldsPanel from "@/components/admin/board-required-fields-panel";
import BoardSyncPanel from "@/components/admin/board-sync-panel";
import BoardTasksPanel from "@/components/admin/board-tasks-panel";
import ClientWorkspaceHeader, {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import PageHeader from "@/components/ui/page-header";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import { useSyncNow } from "@/hooks/use-sync-now";
import { BOARD_DETAIL_COPY } from "@/lib/board-detail";
import type { BoardDetail } from "@/lib/board-sync/board-sync";
import { getProjectsPath } from "@/lib/link-board";
import { getTeamPath } from "@/lib/new-client";
import { getHealthTone } from "@/lib/project-health";

type BoardDetailViewProps = {
  clientId: string;
  // Null when they couldn't load.
  client: ClientWorkspace | null;
  detail: BoardDetail | null;
  isGithubConnected: boolean;
  nowMs: number;
};

// The board detail in place of the Projects & boards tab: the workspace
// header and tabs stay.
export default function BoardDetailView({
  clientId,
  client,
  detail,
  isGithubConnected,
  nowMs,
}: BoardDetailViewProps): React.ReactNode {
  if (client === null) {
    return (
      <>
        <PageHeader breadcrumb={[CLIENTS_CRUMB]} title="Projects & boards" />
        <BoardLoadFailed clientId={clientId} />
      </>
    );
  }

  return (
    <WorkspaceBoard
      client={client}
      detail={detail}
      isGithubConnected={isGithubConnected}
      nowMs={nowMs}
    />
  );
}

function WorkspaceBoard({
  client,
  detail,
  isGithubConnected,
  nowMs,
}: {
  client: ClientWorkspace;
  detail: BoardDetail | null;
  isGithubConnected: boolean;
  nowMs: number;
}): React.ReactNode {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Archive and unarchive post to the Team route, which owns them.
  const archive = useArchiveClient({
    clientName: client.name,
    action: getTeamPath(client.clientId),
    titleRef,
  });

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="projects"
        archive={archive}
        titleRef={titleRef}
      />
      {detail === null ? (
        <BoardLoadFailed clientId={client.clientId} />
      ) : (
        <BoardBody
          clientId={client.clientId}
          detail={detail}
          isGithubConnected={isGithubConnected}
          nowMs={nowMs}
        />
      )}
    </>
  );
}

function BoardBody({
  clientId,
  detail,
  isGithubConnected,
  nowMs,
}: {
  clientId: string;
  detail: BoardDetail;
  isGithubConnected: boolean;
  nowMs: number;
}): React.ReactNode {
  const location = useLocation();
  const nameRef = useRef<HTMLHeadingElement>(null);
  // Read once: later revalidations mustn't move focus again.
  const [isInAppArrival] = useState(() => location.key !== "default");
  const { highlightedId, highlight } = useRowHighlight(null);
  // Sync now posts to the tab's route, which owns it.
  const sync = useSyncNow({
    projectId: detail.id,
    projectName: detail.name,
    action: getProjectsPath(clientId),
    onSynced: highlight,
  });
  const canSync =
    isGithubConnected &&
    !detail.isClientArchived &&
    detail.state !== "unlinked";

  // A sync that ends in an unlink (or archive) takes Sync now away; if it
  // had focus, focus would drop to <body>, so the board name takes it.
  const couldSyncRef = useRef(canSync);
  useEffect(() => {
    const hasLostSync = couldSyncRef.current && !canSync;
    couldSyncRef.current = canSync;
    const isFocusLost =
      document.activeElement === null ||
      document.activeElement === document.body;
    if (hasLostSync && isFocusLost) nameRef.current?.focus();
  }, [canSync]);

  // Arriving from the tab, the clicked link is gone: start at the board.
  useEffect(() => {
    if (isInAppArrival) nameRef.current?.focus();
  }, [isInAppArrival]);

  return (
    <>
      <BoardDetailHeader
        clientId={clientId}
        projectId={detail.id}
        name={detail.name}
        url={detail.url}
        nameRef={nameRef}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <BoardSyncPanel
          detail={detail}
          sync={sync}
          canSync={canSync}
          nowMs={nowMs}
          isSyncedHighlighted={highlightedId === detail.id}
        />
        <BoardRequiredFieldsPanel fieldChecks={detail.fieldChecks} />
      </div>
      <BoardMilestonesPanel
        milestones={detail.milestones}
        tone={getHealthTone(detail.health)}
      />
      <BoardTasksPanel tasks={detail.tasks} hiddenCount={detail.hiddenCount} />
    </>
  );
}

function BoardLoadFailed({ clientId }: { clientId: string }): React.ReactNode {
  return (
    <>
      <BoardBackLink clientId={clientId} />
      <div className="rounded-[3px] border border-line bg-surface">
        <PanelError message={BOARD_DETAIL_COPY.loadFailed} />
      </div>
    </>
  );
}
