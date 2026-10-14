import type { ShouldRevalidateFunctionArgs } from "react-router";
import { z } from "zod";
import type {
  ClientStatus,
  LinkDraft,
  LinkDraftError,
  LinkError,
  Mapping,
} from "@/lib/board-sync/board-sync";
import type { PmStatusOption } from "@/lib/pm-source/pm-source";
import { withoutParam } from "@/lib/new-client";

// The Link drawer opens from `?link=<boardNodeId>` on Admin Home, as the
// create-Client drawer does from `?new=client`.
export const LINK_PARAM = "link";
// The drawer posts to Admin Home's index action under this intent.
export const LINK_ACTION = "/admin?index";
export const INTENT_FIELD = "intent";
export const LINK_INTENT = "link";
export const BOARD_FIELD = "boardNodeId";
export const CLIENT_FIELD = "clientId";
export const OPTIONS_FIELD = "options";
// One field per Status option: `mapping.<optionId>`, "" for Unmapped.
export const MAPPING_FIELD_PREFIX = "mapping.";
export const PROJECTS_ROUTE_PATTERN = "/admin/clients/:clientId/projects";

export const CLIENT_STATUSES = [
  "UP_NEXT",
  "IN_PROGRESS",
  "DONE",
] as const satisfies readonly ClientStatus[];

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  UP_NEXT: "Up next",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export type LinkDraftOutcome =
  | ({ kind: "ready"; boardNodeId: string } & LinkDraft)
  | { kind: "refused"; boardNodeId: string; error: LinkDraftError }
  // The request itself failed (network): the drawer offers a retry.
  | { kind: "failed"; boardNodeId: string };

export type LinkOutcome =
  | {
      kind: "linked";
      clientId: string;
      projectId: string;
      firstSyncFailed: boolean;
    }
  | { kind: "refused"; error: LinkError }
  // Server or network failure.
  | { kind: "failed" };

// History state on the board's Link button: the drawer's title before its
// data arrives.
type LinkOpenerState = { boardTitle: string };

// History state on the navigation that follows a link.
type LinkedProjectState = {
  linkedProjectId: string;
  firstSyncFailed: boolean;
};

export const LINK_COPY = {
  linked: "Board linked",
  linkedSyncFailed: "Board linked, but its first sync failed. Try Sync now.",
  githubFailed: "Couldn't load this board's columns from GitHub.",
  unavailable: "This board is no longer available to link.",
  failed: "Couldn't link the board. Try again.",
  chooseClient: "Choose a Client.",
  noClients: "Create a Client first.",
  noStatusColumn:
    "This board has no Status column, so every Task will be Up next.",
  helper:
    "Unmapped columns count as In progress and are flagged until you map them.",
} as const;

const REFUSAL_COPY: Record<LinkError, string> = {
  "already-linked": "This board was just linked to another Client.",
  archived: "This Client is archived.",
  "client-not-found": "That Client no longer exists.",
  "not-found": "This board is no longer on GitHub.",
  "github-off": LINK_COPY.failed,
};

export function getLinkHref(boardNodeId: string): string {
  const search = new URLSearchParams({ [LINK_PARAM]: boardNodeId });
  return `/admin?${search.toString()}`;
}

export function getLinkDraftPath(boardNodeId: string): string {
  return `/admin/boards/${encodeURIComponent(boardNodeId)}/link-draft`;
}

export function getProjectsPath(clientId: string): string {
  return `/admin/clients/${clientId}/projects`;
}

export function getRelinkNote(clientName: string): string {
  return `Relinking revives ${clientName}'s earlier copy of this board.`;
}

export function getLinkFailure(outcome: LinkOutcome): string {
  return outcome.kind === "refused"
    ? REFUSAL_COPY[outcome.error]
    : LINK_COPY.failed;
}

export function toLinkOpenerState(boardTitle: string): LinkOpenerState {
  return { boardTitle };
}

export function getOpenerBoardTitle(state: unknown): string | null {
  const isOpenerState =
    typeof state === "object" &&
    state !== null &&
    "boardTitle" in state &&
    typeof state.boardTitle === "string";
  // Its shape is checked just above.
  return isOpenerState ? (state as LinkOpenerState).boardTitle : null;
}

export function toLinkedProjectState(
  projectId: string,
  firstSyncFailed: boolean,
): LinkedProjectState {
  return { linkedProjectId: projectId, firstSyncFailed };
}

// The Project just linked, if this location is the navigation after it.
export function getLinkedProject(state: unknown): LinkedProjectState | null {
  const isLinkedState =
    typeof state === "object" &&
    state !== null &&
    "linkedProjectId" in state &&
    typeof state.linkedProjectId === "string" &&
    "firstSyncFailed" in state &&
    typeof state.firstSyncFailed === "boolean";
  // Its shape is checked just above.
  return isLinkedState ? (state as LinkedProjectState) : null;
}

// True when a navigation only opens or closes the Link drawer. Loaders
// needn't run for it.
export function isLinkDrawerToggle({
  currentUrl,
  nextUrl,
}: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.search === nextUrl.search) return false;

  return (
    withoutParam(currentUrl, LINK_PARAM) === withoutParam(nextUrl, LINK_PARAM)
  );
}

function isClientStatus(value: unknown): value is ClientStatus {
  return (CLIENT_STATUSES as readonly unknown[]).includes(value);
}

// Far above any real board; bounds what a tampered post can write before
// the first sync replaces it.
const MAX_OPTIONS = 100;
const MAX_OPTION_TEXT = 256;

const optionsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(MAX_OPTION_TEXT),
      name: z.string().min(1).max(MAX_OPTION_TEXT),
    }),
  )
  .max(MAX_OPTIONS);

// The drawer's options, posted back as JSON. Null when the field is
// missing or malformed: the link is refused rather than losing the mapping.
export function parseOptions(value: unknown): PmStatusOption[] | null {
  if (typeof value !== "string") return null;

  const parsed = optionsSchema.safeParse(parseJson(value));
  return parsed.success ? parsed.data : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // Malformed JSON fails the schema like any other bad shape.
    return null;
  }
}

// Each `mapping.<optionId>` field; anything but a client status is
// Unmapped.
export function parseMapping(form: FormData | null): Mapping {
  const entries = [...(form?.entries() ?? [])]
    .filter(([name]) => name.startsWith(MAPPING_FIELD_PREFIX))
    .map(([name, value]): [string, ClientStatus | null] => [
      name.slice(MAPPING_FIELD_PREFIX.length),
      isClientStatus(value) ? value : null,
    ]);
  return Object.fromEntries(entries);
}
