import { useId } from "react";
import TaskRow from "@/components/projects/task-row";
import DateText from "@/components/ui/date-text";
import ProgressBar from "@/components/ui/progress-bar";
import type { Status } from "@/components/ui/status-icon";
import TaskStatusIcon, {
  TASK_STATUS_LABEL,
} from "@/components/ui/task-status-icon";
import type { ClientStatus } from "@/lib/board-sync/board-sync";
import type { Progress } from "@/lib/client-projects/client-project-rules";
import type { ClientTaskGroups } from "@/lib/client-projects/client-projects";
import { parseDateOnly } from "@/lib/format-date";

type MilestoneHeader = {
  dueDate: string | null;
  progress: Progress;
  tone: Status;
};

type TaskGroupSectionProps = {
  title: string;
  tasks: ClientTaskGroups;
  // A Milestone's due date and progress; Other work has neither.
  milestone?: MilestoneHeader;
};

const STATUS_ORDER: ClientStatus[] = ["UP_NEXT", "IN_PROGRESS", "DONE"];

function SectionHeader({
  title,
  headingId,
  milestone,
}: {
  title: string;
  headingId: string;
  milestone?: MilestoneHeader;
}): React.ReactNode {
  const heading = (
    <h3 id={headingId} className="text-sm/5 font-semibold break-words text-fg">
      {title}
    </h3>
  );
  if (!milestone) return <div className="px-3 pt-3 pb-2">{heading}</div>;

  const { dueDate, progress, tone } = milestone;
  return (
    <div className="px-3 pt-3 pb-2 md:grid md:grid-cols-[minmax(0,1fr)_200px] md:items-end md:gap-x-4">
      <div className="min-w-0">
        {heading}
        {/* Holds the line at md+, where the numbers move to the right. */}
        <p className="hidden h-4 font-mono text-xs/4 text-fg-2 md:block">
          {dueDate !== null && (
            <>
              due <DateText date={parseDateOnly(dueDate)} />
            </>
          )}
        </p>
      </div>
      <div>
        <div className="flex justify-between gap-3 font-mono text-xs/4">
          <span className="text-fg-2 md:hidden">
            {dueDate !== null && (
              <>
                due <DateText date={parseDateOnly(dueDate)} />
              </>
            )}
          </span>
          <span className="text-fg tabular-nums md:ml-auto">
            {progress.done}/{progress.total} · {progress.percent}%
          </span>
        </div>
        <ProgressBar
          percent={progress.percent}
          tone={tone}
          label={`${title} progress`}
          className="mt-1.5"
        />
      </div>
    </div>
  );
}

// One Milestone (or Other work): its header, then Up next, In progress and
// Done, each omitted when empty.
export default function TaskGroupSection({
  title,
  tasks,
  milestone,
}: TaskGroupSectionProps): React.ReactNode {
  const headingId = useId();
  const groups = STATUS_ORDER.filter((status) => tasks[status].length > 0);

  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-line pb-1 first-of-type:border-t-0"
    >
      <SectionHeader
        title={title}
        headingId={headingId}
        milestone={milestone}
      />
      {groups.map((status) => (
        <div key={status}>
          <h4 className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase">
            <TaskStatusIcon status={status} />
            {TASK_STATUS_LABEL[status]}
            <span className="font-mono text-fg tabular-nums">
              {tasks[status].length}
            </span>
          </h4>
          <ul>
            {tasks[status].map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
