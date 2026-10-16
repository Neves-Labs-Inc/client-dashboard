import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import ProjectRow from "@/components/projects/project-row";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";

const PROJECT: ProjectSummary = {
  id: "p1",
  name: "Website redesign",
  isPast: false,
  health: "ON_TRACK",
  latestUpdateAt: new Date("2026-10-07T16:00:00Z"),
  latestNote: "Homepage copy approved.",
  currentMilestone: {
    title: "Pricing page",
    dueDate: "2026-11-14",
    progress: { done: 3, total: 5, percent: 60 },
  },
  taskCounts: { UP_NEXT: 5, IN_PROGRESS: 3, DONE: 17 },
};

describe("ProjectRow", () => {
  it("shows a Milestone's due date on its own day", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProjectRow project={PROJECT} />
      </MemoryRouter>,
    );

    expect(html).toContain('<time dateTime="2026-11-14"');
    expect(html).toContain("Nov 14");
  });
});
