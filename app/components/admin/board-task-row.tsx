import { Columns3, Flag } from "lucide-react";
import {
  CELL_CLASS,
  ROW_GRID_CLASS,
} from "@/components/admin/board-tasks-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import TaskStatusIcon, {
  TASK_STATUS_LABEL,
} from "@/components/ui/task-status-icon";
import { BOARD_DETAIL_COPY } from "@/lib/board-detail";
import type { BoardTask } from "@/lib/board-sync/board-sync";
import { parseDateOnly } from "@/lib/format-date";
import { cn } from "@/lib/utils";

// Static: Tasks don't link anywhere from here.
export default function BoardTaskRow({
  task,
}: {
  task: BoardTask;
}): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell
        className={`${CELL_CLASS.title} text-[13px]/5 wrap-anywhere text-fg`}
      >
        {task.title}
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.status}>
        <span className="inline-flex items-center gap-1.5 text-[13px]/5 whitespace-nowrap text-fg">
          <TaskStatusIcon status={task.clientStatus} />
          {TASK_STATUS_LABEL[task.clientStatus]}
        </span>
      </DataTableCell>
      <DataTableCell
        className={cn(
          CELL_CLASS.option,
          "flex items-center gap-1.5 font-mono text-xs/4 md:text-[13px]/5",
          task.optionName === null ? "text-fg-2" : "text-fg-2 md:text-fg",
        )}
      >
        <Columns3
          size={12}
          aria-hidden="true"
          className="shrink-0 text-fg-2 lg:hidden"
        />
        <span className="min-w-0 wrap-anywhere">
          {task.optionName ?? BOARD_DETAIL_COPY.noStatus}
        </span>
      </DataTableCell>
      <DataTableCell
        className={cn(
          CELL_CLASS.milestone,
          "flex items-start gap-1.5 text-xs/4 md:text-[13px]/5",
          task.milestoneTitle === null ? "text-fg-2" : "text-fg-2 md:text-fg",
        )}
      >
        <Flag
          size={12}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-fg-2 md:mt-1 lg:hidden"
        />
        <span className="line-clamp-2 min-w-0 wrap-anywhere">
          {task.milestoneTitle ?? BOARD_DETAIL_COPY.otherWork}
        </span>
      </DataTableCell>
      <DataTableCell
        className={`${CELL_CLASS.target} font-mono text-xs/4 text-fg-2 md:text-[13px]/5 md:text-fg`}
      >
        {task.targetDate !== null && (
          <>
            <span className="md:hidden">Target </span>
            <DateText date={parseDateOnly(task.targetDate)} />
          </>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}
