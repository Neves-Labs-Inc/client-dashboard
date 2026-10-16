import { Link } from "react-router";
import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/projects/project-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import HealthBadge from "@/components/ui/health-badge";
import ProgressBar from "@/components/ui/progress-bar";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";
import { parseDateOnly } from "@/lib/format-date";
import { getHealthTone } from "@/lib/project-health";
import { cn } from "@/lib/utils";

type ProjectRowProps = {
  project: ProjectSummary;
};

const META_CLASS = "font-mono text-xs/4 text-fg-2";
const NUMBER_CLASS = "font-medium text-fg tabular-nums";

// One link: the title's stretched ::after covers the row, and the row draws
// the focus ring.
export default function ProjectRow({
  project,
}: ProjectRowProps): React.ReactNode {
  const { id, name, isPast, health, latestUpdateAt, latestNote } = project;

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isLink>
      <DataTableCell className={CELL_CLASS.health}>
        {health !== null && <HealthBadge health={health} />}
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.project}>
        <Link
          to={`/projects/${id}`}
          className={cn(
            "line-clamp-2 text-sm/5 font-semibold break-words outline-hidden after:absolute after:inset-0",
            isPast ? "text-fg-2" : "text-fg",
          )}
        >
          {name}
        </Link>
        {isPast && <p className={cn("mt-0.5", META_CLASS)}>Past Project</p>}
        {!isPast && latestUpdateAt !== null && (
          <p className={cn("mt-0.5", META_CLASS)}>
            Updated <DateText date={latestUpdateAt} />
          </p>
        )}
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.update}>
        <p
          className={cn(
            "line-clamp-2 text-[13px]/5 break-words",
            latestNote ? "text-fg" : "text-fg-2",
          )}
        >
          {getNoteText(latestNote)}
        </p>
      </DataTableCell>
      <DataTableCell
        className={cn(
          CELL_CLASS.milestone,
          isPast && latestUpdateAt === null && "max-md:hidden",
        )}
      >
        <MilestoneCell project={project} />
      </DataTableCell>
      <DataTableCell
        className={cn(CELL_CLASS.tasks, isPast && "max-md:hidden")}
        ariaLabel={isPast ? undefined : getTaskLabel(project.taskCounts)}
      >
        {!isPast && <TaskCounts counts={project.taskCounts} />}
      </DataTableCell>
    </DataTableRow>
  );
}

// null: no Status Update. An empty string: one without a body.
function getNoteText(note: string | null): string {
  if (note === null) return "No Status Update yet.";
  if (note === "") return "No note.";

  return note;
}

function getTaskLabel(counts: ProjectSummary["taskCounts"]): string {
  return `${counts.UP_NEXT} Up next, ${counts.IN_PROGRESS} In progress, ${counts.DONE} Done`;
}

function MilestoneCell({
  project,
}: {
  project: ProjectSummary;
}): React.ReactNode {
  const { isPast, health, latestUpdateAt, currentMilestone } = project;

  if (isPast) {
    return latestUpdateAt === null ? null : (
      <p className={META_CLASS}>
        Last update <DateText date={latestUpdateAt} />
      </p>
    );
  }
  if (currentMilestone === null) {
    return <p className={META_CLASS}>No current Milestone</p>;
  }

  const { title, dueDate, progress } = currentMilestone;
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px]/5 text-fg">{title}</span>
        <span className="shrink-0 font-mono text-[13px]/5 text-fg tabular-nums">
          {progress.percent}%
        </span>
      </div>
      <ProgressBar
        className="mt-1"
        percent={progress.percent}
        tone={getHealthTone(health)}
        label={`${title} progress`}
      />
      {dueDate !== null && (
        <p className={cn("mt-1", META_CLASS)}>
          due <DateText date={parseDateOnly(dueDate)} />
        </p>
      )}
    </>
  );
}

// Abbreviated from md up (the cell's aria-label spells it out); spelled out
// below, where there is room.
function TaskCounts({
  counts,
}: {
  counts: ProjectSummary["taskCounts"];
}): React.ReactNode {
  const { UP_NEXT: upNext, IN_PROGRESS: inProgress, DONE: done } = counts;

  return (
    <>
      <span
        aria-hidden="true"
        className={cn("whitespace-nowrap max-md:hidden", META_CLASS)}
      >
        UP <b className={NUMBER_CLASS}>{upNext}</b>
        <span className="ml-2">IP</span>{" "}
        <b className={NUMBER_CLASS}>{inProgress}</b>
        <span className="ml-2">DN</span> <b className={NUMBER_CLASS}>{done}</b>
      </span>
      <span className={cn("md:hidden", META_CLASS)}>
        <b className={NUMBER_CLASS}>{upNext}</b> up next ·{" "}
        <b className={NUMBER_CLASS}>{inProgress}</b> in progress ·{" "}
        <b className={NUMBER_CLASS}>{done}</b> done
      </span>
    </>
  );
}
