import { Link } from "react-router";
import Panel from "@/components/ui/panel";
import { ROW_LINK_HIT_AREA_CLASS } from "@/components/ui/touch-hit-area";
import TaskStatusIcon, {
  TASK_STATUS_LABEL,
} from "@/components/ui/task-status-icon";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { LinkedTask } from "@/lib/requests/request-rules";
import { cn } from "@/lib/utils";

type LinkedTaskPanelProps = {
  task: LinkedTask;
};

// The Task the Admin linked: live while the Client can see it, else its
// last title, marked as no longer tracked.
export default function LinkedTaskPanel({
  task,
}: LinkedTaskPanelProps): React.ReactNode {
  const paths = useClientPaths();

  return (
    <Panel title="Linked task">
      <div className="px-3 py-2">
        {task.tracked ? (
          <>
            <Link
              to={paths.getProjectPath(task.projectId)}
              className={cn(
                ROW_LINK_HIT_AREA_CLASS,
                "text-sm/5 break-words text-accent-fg hover:underline",
              )}
            >
              {task.title}
            </Link>
            <p className="text-[13px]/5 break-words text-fg-2">
              {task.projectName}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[13px]/5 text-fg">
              <TaskStatusIcon status={task.clientStatus} />
              {TASK_STATUS_LABEL[task.clientStatus]}
            </p>
          </>
        ) : (
          <p className="text-sm/5 break-words text-fg">
            {task.title} <span className="text-fg-2">(no longer tracked)</span>
          </p>
        )}
      </div>
    </Panel>
  );
}
