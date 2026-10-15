import type { ClientStatus } from "@/lib/board-sync/board-sync";
import type { projectHealth } from "@/lib/db/schema";

// The Client-facing rules for Projects, Milestones and Tasks. Pure, so the
// Client read models and the Admin board detail share them.

export type Health = (typeof projectHealth.enumValues)[number];

export type Progress = { done: number; total: number; percent: number };

export type TaskGroups<T> = Record<ClientStatus, T[]>;

type PastInput = {
  latestHealth: Health | null;
  closedOnGithub: boolean;
  unlinkedAt: Date | null;
};

type DatedMilestone = { title: string; dueDate: string | null };

type MilestoneWithStatuses = DatedMilestone & { statuses: ClientStatus[] };

type SortableTask = {
  title: string;
  clientStatus: ClientStatus;
  targetDate: string | null;
  completedAt: Date | null;
};

type KpiInput = { isPast: boolean; health: Health | null };

const PERCENT = 100;
const PAST_HEALTHS: ReadonlySet<Health> = new Set(["COMPLETE", "INACTIVE"]);

// Case-insensitive, so "alpha" and "Alpha" sort together.
function compareTitles(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

// ISO dates sort as strings; null (undated) goes last.
function compareDatesUndatedLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  return a < b ? -1 : 1;
}

// Newest first; null (not completed) goes last.
function compareCompletedNewestFirst(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  return b.getTime() - a.getTime();
}

export function isPastProject(project: PastInput): boolean {
  const isPastHealth =
    project.latestHealth !== null && PAST_HEALTHS.has(project.latestHealth);
  return isPastHealth || project.closedOnGithub || project.unlinkedAt !== null;
}

export function getProgress(statuses: ClientStatus[]): Progress {
  const total = statuses.length;
  const done = statuses.filter((status) => status === "DONE").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * PERCENT);
  return { done, total, percent };
}

// Due date ascending, undated last, then title A–Z.
export function sortMilestones<T extends DatedMilestone>(milestones: T[]): T[] {
  return milestones.toSorted(
    (a, b) =>
      compareDatesUndatedLast(a.dueDate, b.dueDate) ||
      compareTitles(a.title, b.title),
  );
}

// The first unfinished Milestone in Milestone order. Null when none has a
// Task left to do.
export function getCurrentMilestone<T extends MilestoneWithStatuses>(
  milestones: T[],
): T | null {
  const unfinished = milestones.filter((milestone) =>
    milestone.statuses.some((status) => status !== "DONE"),
  );
  return sortMilestones(unfinished)[0] ?? null;
}

// Up next and In progress by target date (undated last); Done by completion,
// newest first (null last). Title A–Z breaks every tie.
export function groupTasks<T extends SortableTask>(tasks: T[]): TaskGroups<T> {
  const byStatus = (status: ClientStatus) =>
    tasks.filter((task) => task.clientStatus === status);
  const sortOpen = (group: T[]) =>
    group.toSorted(
      (a, b) =>
        compareDatesUndatedLast(a.targetDate, b.targetDate) ||
        compareTitles(a.title, b.title),
    );

  return {
    UP_NEXT: sortOpen(byStatus("UP_NEXT")),
    IN_PROGRESS: sortOpen(byStatus("IN_PROGRESS")),
    DONE: byStatus("DONE").toSorted(
      (a, b) =>
        compareCompletedNewestFirst(a.completedAt, b.completedAt) ||
        compareTitles(a.title, b.title),
    ),
  };
}

export function getProjectKpis(summaries: KpiInput[]): {
  active: number;
  onTrack: number;
} {
  const active = summaries.filter((summary) => !summary.isPast);
  return {
    active: active.length,
    onTrack: active.filter((summary) => summary.health === "ON_TRACK").length,
  };
}

// Active first, then Past; each by name A–Z.
export function sortProjects<T extends { name: string; isPast: boolean }>(
  projects: T[],
): T[] {
  return projects.toSorted(
    (a, b) =>
      Number(a.isPast) - Number(b.isPast) || compareTitles(a.name, b.name),
  );
}
