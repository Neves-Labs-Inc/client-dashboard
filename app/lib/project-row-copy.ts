import type { RemoveIntent } from "@/lib/projects";

// Copy for a Project row's Unlink and Delete and their inline confirm.

export const REMOVE_COPY = {
  unlink: "Unlink",
  unlinking: "Unlinking…",
  delete: "Delete",
  deleting: "Deleting…",
  keep: "Keep",
  unlinked: "Board unlinked",
  deleted: "Project deleted",
  notFound: "This Project no longer exists.",
  archived: "This Client is archived.",
} as const;

// The first sentence is the question; the rest says what happens.
export function getRemovePrompt(
  intent: RemoveIntent,
  project: { name: string; isLinked: boolean },
  clientName: string,
): { question: string; detail: string } {
  if (intent === "unlink") {
    return {
      question: `Unlink ${project.name}?`,
      detail: `Its Project freezes as it is now and the board returns to the unassigned list. Linking it to ${clientName} again revives it.`,
    };
  }

  const deleted =
    "Its Tasks, Milestones and Status Updates are deleted for good.";
  return {
    question: `Delete ${project.name}?`,
    detail: project.isLinked
      ? `${deleted} The board returns to the unassigned list.`
      : deleted,
  };
}

// The confirm's alert line after a failure. Refusals go to the panel's
// notice instead.
export function getRemoveFailure(
  intent: RemoveIntent,
  projectName: string,
): string {
  return `Couldn't ${intent} ${projectName}. Try again.`;
}
