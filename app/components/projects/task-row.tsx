import DateText from "@/components/ui/date-text";
import TaskStatusIcon, {
  TASK_STATUS_LABEL,
} from "@/components/ui/task-status-icon";
import type { ClientTask } from "@/lib/client-projects/client-projects";
import { parseDateOnly } from "@/lib/format-date";

type TaskRowProps = {
  task: ClientTask;
};

// Blank lines split the note into paragraphs; single newlines stay as breaks.
const PARAGRAPH_BREAK = /\n\s*\n/;

function TaskMeta({ task }: TaskRowProps): React.ReactNode {
  let meta: React.ReactNode = null;
  if (task.clientStatus === "DONE" && task.completedAt !== null) {
    meta = (
      <>
        Completed <DateText date={task.completedAt} />
      </>
    );
  } else if (task.clientStatus !== "DONE" && task.targetDate !== null) {
    meta = (
      <>
        Target <DateText date={parseDateOnly(task.targetDate)} />
      </>
    );
  }
  return (
    meta && (
      <p className="col-start-2 font-mono text-xs/4 text-fg-2 md:col-start-3 md:row-start-1 md:pt-0.5 md:text-right md:whitespace-nowrap">
        {meta}
      </p>
    )
  );
}

// Plain text, never Markdown: the note comes from a GitHub field as typed.
function TaskNote({ note }: { note: string }): React.ReactNode {
  const paragraphs = note
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="col-start-2 mt-1 space-y-2 text-[13px]/5 break-words whitespace-pre-line text-fg-2">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

// Not interactive. The status shows once in the sub-group heading above; the
// sr-only copy keeps a row meaningful when read on its own.
export default function TaskRow({ task }: TaskRowProps): React.ReactNode {
  const hasNote = task.clientNote !== null && task.clientNote.trim() !== "";

  return (
    <li className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-line px-3 py-2 md:grid-cols-[14px_minmax(0,1fr)_auto]">
      <TaskStatusIcon status={task.clientStatus} className="mt-0.5" />
      <p className="text-sm/5 break-words text-fg">
        {task.title}
        <span className="sr-only">
          , {TASK_STATUS_LABEL[task.clientStatus]}
        </span>
      </p>
      <TaskMeta task={task} />
      {hasNote && task.clientNote !== null && (
        <TaskNote note={task.clientNote} />
      )}
    </li>
  );
}
