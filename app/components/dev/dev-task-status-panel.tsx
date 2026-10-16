import Panel from "@/components/ui/panel";
import TaskStatusIcon, {
  TASK_STATUS_LABEL,
} from "@/components/ui/task-status-icon";
import type { ClientStatus } from "@/lib/board-sync/board-sync";

const STATUSES: ClientStatus[] = ["UP_NEXT", "IN_PROGRESS", "DONE"];
const SIZES = [14, 16] as const;

export default function DevTaskStatusPanel(): React.ReactNode {
  return (
    <Panel id="task-status" title="Task status" meta="Icon + label · 14 / 16">
      <div className="flex flex-col gap-3 p-3">
        {SIZES.map((size) => (
          <ul key={size} className="flex flex-wrap gap-4">
            {STATUSES.map((status) => (
              <li
                key={status}
                className="flex items-center gap-1.5 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase"
              >
                <TaskStatusIcon status={status} size={size} />
                {TASK_STATUS_LABEL[status]}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </Panel>
  );
}
