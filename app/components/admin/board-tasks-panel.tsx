import BoardTaskRow from "@/components/admin/board-task-row";
import BoardTasksTable from "@/components/admin/board-tasks-table";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import { BOARD_DETAIL_COPY } from "@/lib/board-detail";
import type { BoardTask } from "@/lib/board-sync/board-sync";

type BoardTasksPanelProps = {
  // Client-visible only, in the read model's order.
  tasks: BoardTask[];
  hiddenCount: number;
};

export default function BoardTasksPanel({
  tasks,
  hiddenCount,
}: BoardTasksPanelProps): React.ReactNode {
  return (
    <Panel
      title="Tasks"
      meta={
        hiddenCount > 0 && (
          <>
            {hiddenCount} hidden
            <span className="sr-only"> from the Client</span>
          </>
        )
      }
    >
      {tasks.length === 0 ? (
        <EmptyState>{BOARD_DETAIL_COPY.noTasks}</EmptyState>
      ) : (
        <BoardTasksTable>
          {tasks.map((task) => (
            <BoardTaskRow key={task.id} task={task} />
          ))}
        </BoardTasksTable>
      )}
    </Panel>
  );
}
