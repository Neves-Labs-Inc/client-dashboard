import { describe, expect, it } from "vitest";
import type { ClientStatus } from "@/lib/board-sync/board-sync";
import {
  getCurrentMilestone,
  getProgress,
  getProjectKpis,
  groupTasks,
  isPastProject,
  sortMilestones,
  sortProjects,
} from "@/lib/client-projects/client-project-rules";

const OPEN_PROJECT = {
  latestHealth: null,
  closedOnGithub: false,
  unlinkedAt: null,
};

describe("isPastProject", () => {
  it("is Past when the latest health is Complete or Inactive", () => {
    expect(isPastProject({ ...OPEN_PROJECT, latestHealth: "COMPLETE" })).toBe(
      true,
    );
    expect(isPastProject({ ...OPEN_PROJECT, latestHealth: "INACTIVE" })).toBe(
      true,
    );
  });

  it("is Past when the board is closed on GitHub or unlinked", () => {
    expect(isPastProject({ ...OPEN_PROJECT, closedOnGithub: true })).toBe(true);
    expect(
      isPastProject({ ...OPEN_PROJECT, unlinkedAt: new Date("2026-10-01") }),
    ).toBe(true);
  });

  it("is active for an open linked board that is at risk or has no health", () => {
    expect(isPastProject({ ...OPEN_PROJECT, latestHealth: "AT_RISK" })).toBe(
      false,
    );
    expect(isPastProject(OPEN_PROJECT)).toBe(false);
  });
});

describe("getProgress", () => {
  it("counts Done Tasks over all Tasks and rounds the percent", () => {
    expect(getProgress(["DONE", "UP_NEXT", "IN_PROGRESS"])).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
    expect(getProgress(["DONE", "DONE", "UP_NEXT"])).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    });
  });

  it("is 0% with no Tasks", () => {
    expect(getProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("sortMilestones", () => {
  it("orders by due date, undated last, then title", () => {
    const sorted = sortMilestones([
      { title: "Undated B", dueDate: null },
      { title: "Late", dueDate: "2026-12-01" },
      { title: "Undated A", dueDate: null },
      { title: "Early b", dueDate: "2026-11-01" },
      { title: "Early A", dueDate: "2026-11-01" },
    ]);

    expect(sorted.map((milestone) => milestone.title)).toEqual([
      "Early A",
      "Early b",
      "Late",
      "Undated A",
      "Undated B",
    ]);
  });
});

describe("getCurrentMilestone", () => {
  it("picks the earliest-due Milestone with a Task not Done", () => {
    const current = getCurrentMilestone([
      { title: "Later", dueDate: "2026-12-01", statuses: ["UP_NEXT"] },
      { title: "Finished", dueDate: "2026-10-01", statuses: ["DONE", "DONE"] },
      { title: "Next", dueDate: "2026-11-01", statuses: ["DONE", "UP_NEXT"] },
    ]);

    expect(current?.title).toBe("Next");
  });

  it("puts undated Milestones after dated ones and breaks ties by title", () => {
    expect(
      getCurrentMilestone([
        { title: "Undated", dueDate: null, statuses: ["UP_NEXT"] },
        { title: "Dated", dueDate: "2027-01-01", statuses: ["IN_PROGRESS"] },
      ])?.title,
    ).toBe("Dated");
    expect(
      getCurrentMilestone([
        { title: "Beta", dueDate: "2026-11-01", statuses: ["UP_NEXT"] },
        { title: "Alpha", dueDate: "2026-11-01", statuses: ["UP_NEXT"] },
      ])?.title,
    ).toBe("Alpha");
  });

  it("is null when every Milestone is Done or has no Tasks", () => {
    expect(
      getCurrentMilestone([
        { title: "Finished", dueDate: "2026-10-01", statuses: ["DONE"] },
        { title: "Empty", dueDate: "2026-09-01", statuses: [] },
      ]),
    ).toBeNull();
  });
});

// A Task with only what ordering reads.
function buildTask(
  title: string,
  clientStatus: ClientStatus,
  dates: { targetDate?: string; completedAt?: string } = {},
) {
  return {
    title,
    clientStatus,
    targetDate: dates.targetDate ?? null,
    completedAt: dates.completedAt ? new Date(dates.completedAt) : null,
  };
}

describe("groupTasks", () => {
  it("orders open groups by target date, undated last, then title", () => {
    const groups = groupTasks([
      buildTask("Undated", "UP_NEXT"),
      buildTask("Late", "UP_NEXT", { targetDate: "2026-12-01" }),
      buildTask("Soon B", "UP_NEXT", { targetDate: "2026-11-01" }),
      buildTask("soon A", "UP_NEXT", { targetDate: "2026-11-01" }),
      buildTask("Work", "IN_PROGRESS"),
    ]);

    expect(groups.UP_NEXT.map((task) => task.title)).toEqual([
      "soon A",
      "Soon B",
      "Late",
      "Undated",
    ]);
    expect(groups.IN_PROGRESS.map((task) => task.title)).toEqual(["Work"]);
    expect(groups.DONE).toEqual([]);
  });

  it("orders Done by completion newest first, undated last, then title", () => {
    const groups = groupTasks([
      buildTask("No date", "DONE"),
      buildTask("Older", "DONE", { completedAt: "2026-10-01T00:00:00Z" }),
      buildTask("Newer B", "DONE", { completedAt: "2026-10-05T00:00:00Z" }),
      buildTask("Newer A", "DONE", { completedAt: "2026-10-05T00:00:00Z" }),
    ]);

    expect(groups.DONE.map((task) => task.title)).toEqual([
      "Newer A",
      "Newer B",
      "Older",
      "No date",
    ]);
  });
});

describe("sortProjects", () => {
  it("lists active Projects A-Z, then Past ones A-Z", () => {
    const sorted = sortProjects([
      { name: "Zeta", isPast: false },
      { name: "Old b", isPast: true },
      { name: "alpha", isPast: false },
      { name: "Old A", isPast: true },
    ]);

    expect(sorted.map((project) => project.name)).toEqual([
      "alpha",
      "Zeta",
      "Old A",
      "Old b",
    ]);
  });
});

describe("getProjectKpis", () => {
  it("counts active Projects and the active ones On track", () => {
    expect(
      getProjectKpis([
        { isPast: false, health: "ON_TRACK" },
        { isPast: false, health: "AT_RISK" },
        { isPast: false, health: null },
        { isPast: true, health: "ON_TRACK" },
        { isPast: true, health: "COMPLETE" },
      ]),
    ).toEqual({ active: 3, onTrack: 1 });
  });
});
