import type { ClientStatus } from "@/lib/board-sync/board-sync";

// The pure rules for Requests. No database or server imports, so the Request
// drawer can share the validation with the server.

export type RequestKind = "BUG" | "FEATURE";
export type RequestStatus =
  "NEW" | "ACCEPTED" | "DECLINED" | "DONE" | "WITHDRAWN";
// The Admin sets every status but Withdrawn.
export type TriageStatus = Exclude<RequestStatus, "WITHDRAWN">;

// Unvalidated form input. Any field may be missing (null) or a File, as
// FormData.get returns them; validation refuses those instead of throwing.
export type RequestDraft = {
  kind: unknown;
  title: unknown;
  description: unknown;
  // Null or "" means no specific Project.
  projectId: unknown;
};

export type ValidDraft = {
  kind: RequestKind;
  title: string;
  description: string;
  projectId: string | null;
};

export type FieldErrors = Partial<
  Record<"kind" | "title" | "description" | "projectId", string>
>;

export type DraftValidation =
  | { isValid: true; draft: ValidDraft }
  | { isValid: false; fieldErrors: FieldErrors };

// Unvalidated form input, like RequestDraft.
export type TriageInput = {
  status: unknown;
  // Null means no note.
  responseNote: unknown;
  // Null or "" means no Task picked.
  taskId: unknown;
};

export type Triage = {
  status: TriageStatus;
  responseNote: string | null;
  taskId: string | null;
};

export type TriageValidation =
  { isValid: true; triage: Triage } | { isValid: false };

export type LiveTask = {
  title: string;
  clientStatus: ClientStatus;
  projectId: string;
  projectName: string;
};

export type LinkedTask =
  ({ tracked: true } & LiveTask) | { tracked: false; title: string };

export type TaskOptionGroup = {
  projectId: string;
  label: string;
  options: { id: string; label: string }[];
};

type OptionProject = { id: string; name: string; unlinkedAt: Date | null };

type OptionTask = {
  id: string;
  projectId: string;
  title: string;
  hiddenAt: Date | null;
};

// The same limits as the requests table's CHECKs.
export const TITLE_MAX = 200;
export const TEXT_MAX = 5000;

const KINDS: readonly string[] = ["BUG", "FEATURE"] satisfies RequestKind[];
const TRIAGE_STATUSES: readonly string[] = [
  "NEW",
  "ACCEPTED",
  "DECLINED",
  "DONE",
] satisfies TriageStatus[];
// Only these keep a linked Task.
const LINKING_STATUSES: readonly string[] = [
  "ACCEPTED",
  "DONE",
] satisfies TriageStatus[];

// Code points, as Postgres's char_length counts them (an emoji is one).
function countCharacters(text: string): number {
  return Array.from(text).length;
}

function isKind(kind: unknown): kind is RequestKind {
  return typeof kind === "string" && KINDS.includes(kind);
}

function isTriageStatus(status: unknown): status is TriageStatus {
  return typeof status === "string" && TRIAGE_STATUSES.includes(status);
}

// A missing or non-text field reads as empty, so it gets the "required" copy.
function toTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Null and "" mean none; undefined for a non-text value, which names nothing.
function toOptionalId(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  return value;
}

// Case-insensitive, so "alpha" and "Alpha" sort together.
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function getTextError(
  text: string,
  max: number,
  messages: { empty: string; tooLong: string },
): string | null {
  if (text === "") return messages.empty;
  if (countCharacters(text) > max) return messages.tooLong;

  return null;
}

// `projectIds` are the Client's Projects (Past and frozen ones included).
export function validateDraft(
  draft: RequestDraft,
  projectIds: readonly string[],
): DraftValidation {
  const title = toTrimmedText(draft.title);
  const description = toTrimmedText(draft.description);
  const kind = isKind(draft.kind) ? draft.kind : null;
  const projectId = toOptionalId(draft.projectId);
  const isProjectValid =
    projectId === null ||
    (projectId !== undefined && projectIds.includes(projectId));
  const errors = {
    kind: kind === null ? "Choose Bug or Feature." : null,
    title: getTextError(title, TITLE_MAX, {
      empty: "Enter a title.",
      tooLong: "Keep the title under 200 characters.",
    }),
    description: getTextError(description, TEXT_MAX, {
      empty: "Describe the bug or the feature.",
      tooLong: "Keep the description under 5,000 characters.",
    }),
    projectId: isProjectValid ? null : "Choose a project from the list.",
  };
  const fieldErrors: FieldErrors = Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== null),
  );

  let validation: DraftValidation;
  if (
    kind === null ||
    projectId === undefined ||
    Object.keys(fieldErrors).length > 0
  ) {
    validation = { isValid: false, fieldErrors };
  } else {
    validation = {
      isValid: true,
      draft: { kind, title, description, projectId },
    };
  }
  return validation;
}

// The note is trimmed (empty becomes null). Only Accepted and Done keep the
// Task; every other status clears the link.
export function validateTriage(input: TriageInput): TriageValidation {
  const isNoteText =
    input.responseNote === null || typeof input.responseNote === "string";
  const note = toTrimmedText(input.responseNote);
  const taskId = toOptionalId(input.taskId);
  if (!isTriageStatus(input.status)) return { isValid: false };
  if (!isNoteText || taskId === undefined) return { isValid: false };
  if (countCharacters(note) > TEXT_MAX) return { isValid: false };

  const isLinking = LINKING_STATUSES.includes(input.status);
  return {
    isValid: true,
    triage: {
      status: input.status,
      responseNote: note === "" ? null : note,
      taskId: isLinking ? taskId : null,
    },
  };
}

// `live` is the Task as the Client may see it: null when it is hidden or
// deleted, and the Request then shows its last title.
export function toLinkedTask(
  snapshotTitle: string | null,
  live: LiveTask | null,
): LinkedTask | null {
  if (live !== null) return { tracked: true, ...live };
  if (snapshotTitle === null) return null;

  return { tracked: false, title: snapshotTitle };
}

// One group per Project with Tasks: the Request's Project first, then the
// others by name A–Z. Tasks A–Z by title. Frozen Projects and hidden Tasks
// are tagged, not left out.
export function buildTaskOptionGroups(
  projects: OptionProject[],
  tasks: OptionTask[],
  requestProjectId: string | null,
): TaskOptionGroup[] {
  return projects
    .toSorted(
      (a, b) =>
        Number(b.id === requestProjectId) - Number(a.id === requestProjectId) ||
        compareNames(a.name, b.name),
    )
    .map((project) => ({
      projectId: project.id,
      label:
        project.unlinkedAt === null
          ? project.name
          : `${project.name} (unlinked)`,
      options: tasks
        .filter((task) => task.projectId === project.id)
        .toSorted((a, b) => compareNames(a.title, b.title))
        .map((task) => ({
          id: task.id,
          label: task.hiddenAt === null ? task.title : `${task.title} (hidden)`,
        })),
    }))
    .filter((group) => group.options.length > 0);
}
