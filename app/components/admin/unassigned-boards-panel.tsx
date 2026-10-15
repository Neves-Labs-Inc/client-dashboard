import { Unplug } from "lucide-react";
import { Suspense, useRef } from "react";
import { Await } from "react-router";
import UnassignedBoardRow from "@/components/admin/unassigned-board-row";
import UnassignedBoardRowSkeleton from "@/components/admin/unassigned-board-row-skeleton";
import { TABLE_GRID_CLASS } from "@/components/admin/unassigned-boards-grid";
import DataTable from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import SkeletonGroup from "@/components/ui/skeleton-group";
import type { UnassignedBoard } from "@/lib/board-sync/board-sync";

const TITLE = "Unassigned GitHub boards";
const SKELETON_ROW_COUNT = 3;
const COLUMNS = [
  { header: "Board" },
  { header: "State" },
  { header: "Updated" },
  { header: "Actions", isLabelHidden: true },
];

type UnassignedBoardsPanelProps = {
  // Null when the boards couldn't load.
  boards: Promise<UnassignedBoard[] | "github-off" | null>;
};

export default function UnassignedBoardsPanel({
  boards,
}: UnassignedBoardsPanelProps): React.ReactNode {
  // Focused after a successful retry: the error's "Try again" goes away.
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Suspense fallback={<BoardsPanelLoading />}>
      <Await resolve={boards}>
        {(resolved) => {
          if (resolved === null) {
            return (
              <Panel title={TITLE} titleRef={titleRef}>
                <PanelError
                  message="Couldn't load boards."
                  getReturnFocusTarget={() => titleRef.current}
                />
              </Panel>
            );
          }
          if (resolved === "github-off") {
            return (
              <Panel title={TITLE} titleRef={titleRef}>
                <EmptyState
                  icon={
                    <Unplug
                      size={16}
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  }
                >
                  GitHub isn&apos;t connected.
                </EmptyState>
              </Panel>
            );
          }

          return (
            <Panel
              title={TITLE}
              titleRef={titleRef}
              meta={
                resolved.length > 0
                  ? `${resolved.length} unassigned`
                  : undefined
              }
            >
              {resolved.length === 0 ? (
                <EmptyState>Every board is linked.</EmptyState>
              ) : (
                <DataTable
                  label={TITLE}
                  columns={COLUMNS}
                  gridClassName={TABLE_GRID_CLASS}
                >
                  {resolved.map((board) => (
                    <UnassignedBoardRow key={board.nodeId} board={board} />
                  ))}
                </DataTable>
              )}
            </Panel>
          );
        }}
      </Await>
    </Suspense>
  );
}

function BoardsPanelLoading(): React.ReactNode {
  return (
    <Panel title={TITLE}>
      <SkeletonGroup label="boards">
        <DataTable
          label={TITLE}
          columns={COLUMNS}
          gridClassName={TABLE_GRID_CLASS}
        >
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <UnassignedBoardRowSkeleton key={index} />
          ))}
        </DataTable>
      </SkeletonGroup>
    </Panel>
  );
}
