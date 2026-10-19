import { randomUUID } from "node:crypto";
import type {
  PmBoard,
  PmBoardSummary,
  PmItem,
  PmSource,
  PmStatusOption,
  PmStatusUpdate,
} from "@/lib/pm-source/pm-source";

// Builders for PmSource data and an in-memory PmSource. Node ids are random,
// so boards built in parallel tests never collide.

type IssueItem = Extract<PmItem, { kind: "issue" }>;

const ALL_FIELDS = {
  clientVisibility: "present",
  clientNote: "present",
  targetDate: "present",
} as const;

export function buildBoard(overrides: Partial<PmBoard> = {}): PmBoard {
  return {
    nodeId: `PVT_${randomUUID()}`,
    number: 7,
    title: "Website rebuild",
    url: "https://github.com/orgs/neves-labs/projects/7",
    closed: false,
    updatedAt: new Date("2026-10-01T12:00:00Z"),
    statusOptions: [],
    fields: ALL_FIELDS,
    items: [],
    statusUpdates: [],
    ...overrides,
  };
}

export function buildIssue(overrides: Partial<IssueItem> = {}): IssueItem {
  return {
    kind: "issue",
    itemNodeId: `PVTI_${randomUUID()}`,
    issueNodeId: `I_${randomUUID()}`,
    repositoryNodeId: `R_${randomUUID()}`,
    title: "Build the login page",
    closedAt: null,
    milestone: null,
    visibility: "Visible",
    statusOptionId: null,
    clientNote: null,
    targetDate: null,
    ...overrides,
  };
}

export function buildStatusOption(name: string): PmStatusOption {
  return { id: `opt_${randomUUID()}`, name };
}

export function buildStatusUpdate(
  overrides: Partial<PmStatusUpdate> = {},
): PmStatusUpdate {
  return {
    nodeId: `PVTSU_${randomUUID()}`,
    health: "ON_TRACK",
    startDate: null,
    targetDate: null,
    body: "All good.",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    ...overrides,
  };
}

export function toSummary(board: PmBoard): PmBoardSummary {
  const { nodeId, number, title, url, closed, updatedAt } = board;
  return { nodeId, number, title, url, closed, updatedAt };
}

type BoardResponse = PmBoard | null | Error;

// Each getBoard answers with the board's next queued response; the last one
// repeats. An Error response is thrown. An unknown board is null (deleted).
export class FakePmSource implements PmSource {
  readonly getBoardCalls: string[] = [];
  boardSummaries: PmBoardSummary[] = [];
  listBoardsError: Error | null = null;
  // Delays the next getBoard answer, to let a concurrent call overtake it.
  nextGetBoardDelayMs = 0;
  readonly #responses = new Map<string, BoardResponse[]>();

  setBoard(nodeId: string, ...responses: BoardResponse[]): void {
    this.#responses.set(nodeId, responses);
  }

  async listBoards(): Promise<PmBoardSummary[]> {
    if (this.listBoardsError !== null) throw this.listBoardsError;

    return this.boardSummaries;
  }

  async getBoard(boardNodeId: string): Promise<PmBoard | null> {
    this.getBoardCalls.push(boardNodeId);
    const delayMs = this.nextGetBoardDelayMs;
    this.nextGetBoardDelayMs = 0;
    const queue = this.#responses.get(boardNodeId) ?? [null];
    const response = queue.length > 1 ? queue.shift() : queue[0];
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (response instanceof Error) throw response;

    return response ?? null;
  }

  async getStatusOptions(
    boardNodeId: string,
  ): Promise<PmStatusOption[] | null> {
    const board = await this.getBoard(boardNodeId);
    return board?.statusOptions ?? null;
  }
}
