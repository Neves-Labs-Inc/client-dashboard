import { describe, expect, it } from "vitest";
import {
  buildTaskOptionGroups,
  toLinkedTask,
  validateDraft,
  validateTriage,
} from "@/lib/requests/request-rules";

const PROJECT_ID = "0199f0a0-0000-7000-8000-000000000001";
const VALID_DRAFT = {
  kind: "BUG",
  title: "Login fails",
  description: "Steps to reproduce.",
  projectId: null,
};

describe("validateDraft", () => {
  it("accepts a valid draft and trims the title and description", () => {
    const validation = validateDraft(
      {
        kind: "FEATURE",
        title: "  Export to CSV  ",
        description: "\n Please add it. \n",
        projectId: PROJECT_ID,
      },
      [PROJECT_ID],
    );

    expect(validation).toEqual({
      isValid: true,
      draft: {
        kind: "FEATURE",
        title: "Export to CSV",
        description: "Please add it.",
        projectId: PROJECT_ID,
      },
    });
  });

  it("requires a title and a description, blank counting as empty", () => {
    const validation = validateDraft(
      { ...VALID_DRAFT, title: "   ", description: "" },
      [],
    );

    expect(validation).toEqual({
      isValid: false,
      fieldErrors: {
        title: "Enter a title.",
        description: "Describe the bug or the feature.",
      },
    });
  });

  it("allows 200 title characters and 5,000 description characters", () => {
    const validation = validateDraft(
      { ...VALID_DRAFT, title: "a".repeat(200), description: "b".repeat(5000) },
      [],
    );

    expect(validation.isValid).toBe(true);
  });

  it("refuses a longer title or description", () => {
    const validation = validateDraft(
      { ...VALID_DRAFT, title: "a".repeat(201), description: "b".repeat(5001) },
      [],
    );

    expect(validation).toEqual({
      isValid: false,
      fieldErrors: {
        title: "Keep the title under 200 characters.",
        description: "Keep the description under 5,000 characters.",
      },
    });
  });

  it("counts characters as Postgres does, so an emoji is one", () => {
    const validation = validateDraft(
      { ...VALID_DRAFT, title: "😀".repeat(200) },
      [],
    );

    expect(validation.isValid).toBe(true);
  });

  it("refuses a kind other than Bug or Feature", () => {
    const validation = validateDraft({ ...VALID_DRAFT, kind: "QUESTION" }, []);

    expect(validation).toEqual({
      isValid: false,
      fieldErrors: { kind: "Choose Bug or Feature." },
    });
  });

  it("refuses a Project that isn't one of the Client's", () => {
    const validation = validateDraft(
      { ...VALID_DRAFT, projectId: "not-a-project" },
      [PROJECT_ID],
    );

    expect(validation).toEqual({
      isValid: false,
      fieldErrors: { projectId: "Choose a project from the list." },
    });
  });

  it('treats "" as no Project', () => {
    const validation = validateDraft({ ...VALID_DRAFT, projectId: "" }, []);

    expect(validation).toMatchObject({ draft: { projectId: null } });
  });

  it("refuses missing or non-text fields with field errors instead of throwing", () => {
    const file = new File(["x"], "x.txt");

    const validation = validateDraft(
      { kind: null, title: null, description: file, projectId: file },
      [PROJECT_ID],
    );

    expect(validation).toEqual({
      isValid: false,
      fieldErrors: {
        kind: "Choose Bug or Feature.",
        title: "Enter a title.",
        description: "Describe the bug or the feature.",
        projectId: "Choose a project from the list.",
      },
    });
  });
});

describe("validateTriage", () => {
  const TASK_ID = "0199f0a0-0000-7000-8000-000000000002";

  it("keeps the Task for Accepted and Done", () => {
    for (const status of ["ACCEPTED", "DONE"]) {
      expect(
        validateTriage({ status, responseNote: "", taskId: TASK_ID }),
      ).toEqual({
        isValid: true,
        triage: { status, responseNote: null, taskId: TASK_ID },
      });
    }
  });

  it("drops the Task for New and Declined", () => {
    for (const status of ["NEW", "DECLINED"]) {
      expect(
        validateTriage({ status, responseNote: "", taskId: TASK_ID }),
      ).toMatchObject({ triage: { taskId: null } });
    }
  });

  it("treats an empty Task pick as no Task", () => {
    expect(
      validateTriage({ status: "DONE", responseNote: "", taskId: "" }),
    ).toMatchObject({ triage: { taskId: null } });
  });

  it("trims the response note, an empty one becoming null", () => {
    expect(
      validateTriage({
        status: "DONE",
        responseNote: "  Shipped. ",
        taskId: null,
      }),
    ).toMatchObject({ triage: { responseNote: "Shipped." } });
    expect(
      validateTriage({ status: "DONE", responseNote: " \n ", taskId: null }),
    ).toMatchObject({ triage: { responseNote: null } });
  });

  it("treats a missing note as none and refuses non-text fields", () => {
    const file = new File(["x"], "x.txt");

    expect(
      validateTriage({ status: "DONE", responseNote: null, taskId: null }),
    ).toMatchObject({ triage: { responseNote: null } });
    expect(
      validateTriage({ status: null, responseNote: "", taskId: null }),
    ).toEqual({ isValid: false });
    expect(
      validateTriage({ status: "DONE", responseNote: file, taskId: null }),
    ).toEqual({ isValid: false });
    expect(
      validateTriage({ status: "DONE", responseNote: "", taskId: file }),
    ).toEqual({ isValid: false });
  });

  it("refuses Withdrawn, an unknown status and a note over 5,000 characters", () => {
    expect(
      validateTriage({ status: "WITHDRAWN", responseNote: "", taskId: null }),
    ).toEqual({ isValid: false });
    expect(
      validateTriage({ status: "LATER", responseNote: "", taskId: null }),
    ).toEqual({ isValid: false });
    expect(
      validateTriage({
        status: "NEW",
        responseNote: "a".repeat(5001),
        taskId: null,
      }),
    ).toEqual({ isValid: false });
  });
});

describe("toLinkedTask", () => {
  it("is tracked when the Task is found", () => {
    const linked = toLinkedTask("Old title", {
      title: "Live title",
      clientStatus: "IN_PROGRESS",
      projectId: PROJECT_ID,
      projectName: "Website",
    });

    expect(linked).toEqual({
      tracked: true,
      title: "Live title",
      clientStatus: "IN_PROGRESS",
      projectId: PROJECT_ID,
      projectName: "Website",
    });
  });

  it("falls back to the last title when the Task isn't found", () => {
    expect(toLinkedTask("Old title", null)).toEqual({
      tracked: false,
      title: "Old title",
    });
  });

  it("is null without a link", () => {
    expect(toLinkedTask(null, null)).toBeNull();
  });
});

describe("buildTaskOptionGroups", () => {
  const projects = [
    { id: "p-zeta", name: "Zeta", unlinkedAt: null },
    { id: "p-alpha", name: "alpha", unlinkedAt: new Date("2026-10-01") },
    { id: "p-mid", name: "Mid", unlinkedAt: null },
    { id: "p-empty", name: "Empty", unlinkedAt: null },
  ];
  const tasks = [
    { id: "t1", projectId: "p-zeta", title: "beta", hiddenAt: null },
    { id: "t2", projectId: "p-zeta", title: "Alpha", hiddenAt: new Date() },
    { id: "t3", projectId: "p-alpha", title: "One", hiddenAt: null },
    { id: "t4", projectId: "p-mid", title: "Two", hiddenAt: null },
  ];

  it("puts the Request's Project first, then the others A–Z, skipping empty ones", () => {
    const groups = buildTaskOptionGroups(projects, tasks, "p-mid");

    expect(groups.map((group) => group.projectId)).toEqual([
      "p-mid",
      "p-alpha",
      "p-zeta",
    ]);
  });

  it("tags frozen Projects and hidden Tasks, Tasks A–Z", () => {
    const groups = buildTaskOptionGroups(projects, tasks, null);

    expect(groups).toEqual([
      {
        projectId: "p-alpha",
        label: "alpha (unlinked)",
        options: [{ id: "t3", label: "One" }],
      },
      {
        projectId: "p-mid",
        label: "Mid",
        options: [{ id: "t4", label: "Two" }],
      },
      {
        projectId: "p-zeta",
        label: "Zeta",
        options: [
          { id: "t2", label: "Alpha (hidden)" },
          { id: "t1", label: "beta" },
        ],
      },
    ]);
  });
});
