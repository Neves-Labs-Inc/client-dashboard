import BoardTasksTable from "@/components/admin/board-tasks-table";
import {
  CELL_CLASS,
  ROW_GRID_CLASS,
} from "@/components/admin/board-tasks-grid";
import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const FACT_ROW_COUNT = 3;
const FIELD_ROW_COUNT = 3;
const MILESTONE_ROW_COUNT = 2;
const TASK_ROW_COUNT = 5;

// A box with a text line's height, so blocks sit where the text will.
function Line({
  className = "h-5",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <div className={`flex items-center ${className}`}>{children}</div>;
}

function PanelFrame({
  titleClassName,
  action,
  children,
}: {
  titleClassName: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="min-w-0 rounded-[3px] border border-line bg-surface">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3 py-2">
        <Skeleton className={`h-3 ${titleClassName}`} />
        {action}
      </div>
      {children}
    </div>
  );
}

// The board detail in blocks, line box for line box, so nothing shifts when
// the page arrives. The Sync panel assumes three fact rows and no issue
// lines.
export default function BoardDetailSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="board">
      <div className="flex flex-col gap-4">
        <WorkspaceHeaderSkeleton />
        <div className="flex flex-col gap-1">
          <Line className="h-11 md:h-5 pointer-coarse:h-11">
            <Skeleton className="h-3 w-28" />
          </Line>
          <Line>
            <Skeleton className="h-3.5 w-[40%]" />
          </Line>
          {/* Below md "Open on GitHub" takes its own line. */}
          <Line className="h-5 md:hidden">
            <Skeleton className="h-3 w-24" />
          </Line>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <PanelFrame
            titleClassName="w-12"
            action={
              <Skeleton className="h-11 w-24 md:h-8 md:w-20 pointer-coarse:h-11" />
            }
          >
            {Array.from({ length: FACT_ROW_COUNT }, (_, index) => (
              <div
                key={index}
                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 border-t border-line px-3 py-2 first:border-t-0"
              >
                <Line>
                  <Skeleton className="h-3 w-16" />
                </Line>
                <Line>
                  <Skeleton className="h-3 w-32" />
                </Line>
              </div>
            ))}
          </PanelFrame>
          <PanelFrame titleClassName="w-28">
            {Array.from({ length: FIELD_ROW_COUNT }, (_, index) => (
              <div
                key={index}
                className="flex min-h-10 items-center justify-between gap-3 border-t border-line px-3 py-2 first:border-t-0"
              >
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </PanelFrame>
        </div>
        <PanelFrame titleClassName="w-20">
          {Array.from({ length: MILESTONE_ROW_COUNT }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,3fr)_minmax(120px,2fr)_56px_88px] md:items-center md:gap-x-3 lg:grid-cols-[minmax(0,1fr)_minmax(140px,240px)_56px_88px]"
            >
              <Line className="col-start-1 row-start-1 h-5 md:col-auto md:row-auto">
                <Skeleton className="h-3 w-[50%]" />
              </Line>
              <div className="col-span-full row-start-2 h-1 rounded-[1px] bg-surface-3 md:col-span-1 md:row-auto" />
              <Line className="col-start-2 row-start-1 h-5 justify-end md:col-auto md:row-auto">
                <Skeleton className="h-3 w-8" />
              </Line>
              <Line className="col-span-full row-start-3 h-4 md:col-span-1 md:row-auto">
                <Skeleton className="h-2.5 w-16" />
              </Line>
            </div>
          ))}
        </PanelFrame>
        <PanelFrame titleClassName="w-12">
          <BoardTasksTable>
            {Array.from({ length: TASK_ROW_COUNT }, (_, index) => (
              <TaskRowSkeleton key={index} />
            ))}
          </BoardTasksTable>
        </PanelFrame>
      </div>
    </SkeletonGroup>
  );
}

// Same grid and cell placement as BoardTaskRow.
function TaskRowSkeleton(): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.title}>
        <Line>
          <Skeleton className="h-3 w-[60%]" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.status}>
        <Line>
          <Skeleton className="h-3 w-20" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.option}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-16" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.milestone}>
        <Line className="h-4 md:h-5">
          <Skeleton className="h-2.5 w-24" />
        </Line>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.target}>
        <Line className="h-4 justify-end md:h-5 md:justify-start">
          <Skeleton className="h-2.5 w-12" />
        </Line>
      </DataTableCell>
    </DataTableRow>
  );
}
