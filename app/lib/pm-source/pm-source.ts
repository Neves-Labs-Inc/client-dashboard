// The PM-source seam. Only board sync reads boards; nothing else knows the
// provider (GitHub Projects v2 through a read-only GitHub App).

export type Health =
  "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETE" | "INACTIVE";

export type PmBoardSummary = {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
  updatedAt: Date;
};

export type PmStatusOption = { id: string; name: string };

export type PmStatusUpdate = {
  nodeId: string;
  health: Health | null;
  // Plain `YYYY-MM-DD`.
  startDate: string | null;
  targetDate: string | null;
  // Raw Markdown.
  body: string;
  createdAt: Date;
};

export type PmItem =
  | {
      kind: "issue";
      itemNodeId: string;
      issueNodeId: string;
      repositoryNodeId: string;
      title: string;
      closedAt: Date | null;
      // `dueOn` is a plain `YYYY-MM-DD`.
      milestone: { title: string; dueOn: string | null } | null;
      visibility: "Visible" | "Internal" | null;
      statusOptionId: string | null;
      clientNote: string | null;
      targetDate: string | null;
    }
  // A pull request or a draft issue.
  | { kind: "other"; itemNodeId: string }
  // GitHub redacts it: it lives in a repo the App can't read.
  | { kind: "unreadable"; itemNodeId: string };

// "present": a project field with that exact name and type. "issue-field": an
// org issue field with that name (any type), whose values the sync can't read.
export type PmFieldState = "present" | "missing" | "issue-field";

export type PmBoard = PmBoardSummary & {
  // [] when the board has no single-select field named "Status".
  statusOptions: PmStatusOption[];
  fields: {
    clientVisibility: PmFieldState;
    clientNote: PmFieldState;
    targetDate: PmFieldState;
  };
  items: PmItem[];
  statusUpdates: PmStatusUpdate[];
};

// Every method throws PmSourceError on an infra failure (network, 5xx, rate
// limit, bad credentials, malformed response). Only a missing board is null.
export type PmSource = {
  // Every non-template board of the org, open and closed.
  listBoards(): Promise<PmBoardSummary[]>;
  // null when the board doesn't exist (deleted).
  getBoard(boardNodeId: string): Promise<PmBoard | null>;
  // Cheap: the Status field's options only, no items. null as for getBoard.
  getStatusOptions(boardNodeId: string): Promise<PmStatusOption[] | null>;
};

// An infra failure. The message is short and safe to show the Admin; the
// cause is logged, never shown.
export class PmSourceError extends Error {
  override name = "PmSourceError";
}
