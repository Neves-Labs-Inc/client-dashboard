import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/db";
import {
  clients,
  githubBoards,
  milestones,
  projects,
  projectStatusMappings,
  statusUpdates,
  tasks,
  taskClientStatus,
  type SyncWarning,
} from "@/lib/db/schema";
import {
  getProgress,
  groupTasks,
  sortMilestones,
  type Health,
  type Progress,
} from "@/lib/client-projects/client-project-rules";
import { describeError } from "@/lib/describe-error";
import {
  PmSourceError,
  type PmBoard,
  type PmBoardSummary,
  type PmItem,
  type PmSource,
  type PmStatusOption,
} from "@/lib/pm-source/pm-source";
import type { Result } from "@/lib/result";

// The board-sync module: the only caller of PmSource and the only writer of
// the board mirror tables (github_boards, projects, status_updates,
// milestones, tasks, project_status_mappings). Every write runs as
// app_system.

export type ClientStatus = (typeof taskClientStatus.enumValues)[number];

export type SyncError =
  "github-off" | "not-found" | "unlinked" | "archived" | "sync-failed";

// GitHub option id → client status; null is Unmapped.
export type Mapping = Record<string, ClientStatus | null>;

export type UnassignedBoard = PmBoardSummary;

export type LinkDraft = {
  board: UnassignedBoard;
  options: PmStatusOption[];
  // For each Client with a frozen copy of the board: its old mapping.
  frozenMappings: Record<string, Mapping>;
};

export type LinkDraftError =
  "github-off" | "not-found" | "already-linked" | "github-failed";

export type LinkInput = {
  boardNodeId: string;
  clientId: string;
  mapping: Mapping;
  // The draft's options, for the mapping rows' names until the first sync
  // refreshes them. Mapping ids not among them are ignored.
  options: PmStatusOption[];
};

export type LinkError =
  | "github-off"
  | "not-found"
  | "already-linked"
  | "client-not-found"
  | "archived";

export type ProjectState = "linked" | "closed-on-github" | "unlinked";

export type ProjectRow = {
  id: string;
  name: string;
  url: string;
  state: ProjectState;
  unlinkedAt: Date | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  unmappedCount: number;
};

export type MappingEdit = {
  projectName: string;
  options: { id: string; name: string; clientStatus: ClientStatus | null }[];
};

export type SaveMappingError = "not-found" | "unlinked" | "archived";

export type RequiredField = Extract<
  SyncWarning,
  { kind: "missing-field" }
>["field"];

// "not-checked": the Project has never synced, so nothing has looked yet.
export type FieldCheck = "present" | "missing" | "not-checked";

export type BoardMilestone = {
  id: string;
  title: string;
  dueDate: string | null;
  progress: Progress;
};

export type BoardTask = {
  id: string;
  title: string;
  clientStatus: ClientStatus;
  // The Status option's name; null when the Task has no option (or its
  // option is no longer stored).
  optionName: string | null;
  // Null for Other work.
  milestoneTitle: string | null;
  targetDate: string | null;
};

// The Admin's board detail: what the Client sees of the Project, and
// whether its data is flowing.
export type BoardDetail = {
  id: string;
  name: string;
  url: string;
  state: ProjectState;
  unlinkedAt: Date | null;
  isClientArchived: boolean;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  syncWarnings: SyncWarning[];
  unmappedCount: number;
  // The latest Status Update's; null when there is none or it has none.
  health: Health | null;
  // One per required field, in REQUIRED_FIELDS order.
  fieldChecks: { field: RequiredField; check: FieldCheck }[];
  // As the Client sees them: Milestone order, only those with a visible
  // Task.
  milestones: BoardMilestone[];
  // Client-visible only: by Milestone (Other work last), then the Client's
  // Task order.
  tasks: BoardTask[];
  hiddenCount: number;
};

export type RemoveError = "not-found" | "archived";

export type BoardSync = {
  // False when GitHub is off: no board can be linked or synced.
  isGithubConnected: boolean;
  // Pool boards no linked Project uses: open first, then closed, each by
  // title (case-insensitive).
  listUnassignedBoards(): Promise<UnassignedBoard[] | "github-off">;
  // The Link drawer's data. Its Status options are the one live GitHub call
  // a page makes.
  getLinkDraft(boardNodeId: string): Promise<Result<LinkDraft, LinkDraftError>>;
  // Links the board to the Client (reviving its frozen copy, if any), then
  // runs the first sync. A failed first sync still links.
  link(
    input: LinkInput,
  ): Promise<
    Result<{ projectId: string; firstSyncFailed: boolean }, LinkError>
  >;
  // The Client's Projects: linked and closed ones by name, then unlinked
  // ones by name (case-insensitive).
  listProjects(clientId: string): Promise<ProjectRow[]>;
  // The Map columns drawer's data: the Project's stored Status options,
  // as the last sync saw them, by name. Null for an unknown Project. Never
  // calls GitHub.
  getMapping(projectId: string): Promise<MappingEdit | null>;
  // The Admin's board detail. Null for another Client's Project, an unknown
  // id or a malformed one. Never calls GitHub.
  getBoardDetail(
    clientId: string,
    projectId: string,
  ): Promise<BoardDetail | null>;
  // Sets client_status on the options the Project already has; ids it
  // doesn't know are ignored (the sync owns which options exist). Takes
  // effect at once, as a Task's client status is derived at read time.
  saveMapping(
    projectId: string,
    mapping: Mapping,
  ): Promise<Result<null, SaveMappingError>>;
  // Freezes the Project as it is (a Past Project, no longer synced) and
  // returns its board to the pool. Already unlinked: success, no change.
  unlink(projectId: string): Promise<Result<null, RemoveError>>;
  // Deletes the Project, linked or not; the FK cascade deletes its rows, and
  // a linked board returns to the pool.
  deleteProject(projectId: string): Promise<Result<null, RemoveError>>;
  // The Admin's Sync now: syncProject.
  syncNow(projectId: string): Promise<Result<null, SyncError>>;
  // Refreshes the org board pool cache from GitHub.
  refreshPool(): Promise<void>;
  // Syncs the linked Project with that board, if any.
  syncBoardByNodeId(boardNodeId: string): Promise<void>;
  // Syncs the linked Projects with a task row (hidden or not) for the issue.
  syncBoardsWithIssue(issueNodeId: string): Promise<void>;
  // Syncs the linked Projects with a task row from the repository.
  syncBoardsWithRepository(repositoryNodeId: string): Promise<void>;
  // The poll: refreshes the pool, then syncs every eligible Project. Skipped
  // while another reconcile runs.
  reconcile(): Promise<{ skipped: boolean; synced: number; failed: number }>;
  // The engine every trigger goes through. A failure is recorded on the
  // Project (last_sync_error) and returned as sync-failed.
  syncProject(projectId: string): Promise<Result<null, SyncError>>;
};

type BoardSyncDeps = {
  db: Db;
  // null when GitHub is off: triggers are no-ops, syncProject is github-off.
  pmSource: PmSource | null;
  now: () => Date;
};

// pg_try_advisory_xact_lock key for reconcile: one poll at a time.
export const RECONCILE_LOCK_KEY = 4_048_202_610_001n;
// Namespace for the per-Project sync lock. Two-int advisory keys never
// overlap the single-bigint key space reconcile uses.
const PROJECT_LOCK_NAMESPACE = 4_048;
// Namespace for the per-board link lock, so two links of one board
// serialize.
const BOARD_LOCK_NAMESPACE = 4_049;
const GENERIC_SYNC_ERROR = "Sync failed";
// Shape check only, as in db.ts.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BY_ERROR = {
  "github-off": 503,
  "not-found": 404,
  unlinked: 409,
  archived: 409,
  "sync-failed": 502,
} satisfies Record<SyncError, number>;

const STATUS_BY_LINK_ERROR = {
  "github-off": 503,
  "not-found": 404,
  "already-linked": 409,
  "github-failed": 502,
  "client-not-found": 404,
  archived: 409,
} satisfies Record<LinkDraftError | LinkError, number>;

const CREATED = 201;

type IssueItem = Extract<PmItem, { kind: "issue" }>;
type MissingField = RequiredField;

export const REQUIRED_FIELDS: readonly RequiredField[] = [
  "Client visibility",
  "Client note",
  "Target date",
];

// A Task's client status: no Status option is Up next; an option the Admin
// hasn't mapped (or with no mapping row yet) is In progress.
export function getClientStatus(
  statusOptionId: string | null,
  mappings: Map<string, ClientStatus | null>,
): ClientStatus {
  if (statusOptionId === null) return "UP_NEXT";

  return mappings.get(statusOptionId) ?? "IN_PROGRESS";
}

export function createBoardSync(deps: BoardSyncDeps): BoardSync {
  const { db, pmSource, now } = deps;

  async function refreshPool(): Promise<void> {
    if (pmSource === null) return;

    const boards = keepLastBy(
      await pmSource.listBoards(),
      (board) => board.nodeId,
    );
    const refreshedAt = now();
    await db.withSystem(async (tx) => {
      if (boards.length > 0) {
        await tx
          .insert(githubBoards)
          .values(
            boards.map((board) => ({
              nodeId: board.nodeId,
              number: board.number,
              title: board.title,
              url: board.url,
              closed: board.closed,
              githubUpdatedAt: board.updatedAt,
              refreshedAt,
            })),
          )
          .onConflictDoUpdate({
            target: githubBoards.nodeId,
            set: {
              number: sql`excluded.number`,
              title: sql`excluded.title`,
              url: sql`excluded.url`,
              closed: sql`excluded.closed`,
              githubUpdatedAt: sql`excluded.github_updated_at`,
              refreshedAt: sql`excluded.refreshed_at`,
            },
          });
      }
      await tx.delete(githubBoards).where(
        notInArray(
          githubBoards.nodeId,
          boards.map((board) => board.nodeId),
        ),
      );
    });
  }

  async function syncProject(
    projectId: string,
  ): Promise<Result<null, SyncError>> {
    if (pmSource === null) return fail("github-off", projectId);
    // Postgres would reject a malformed id (22P02), and so would the failure
    // record; it can't name a Project.
    if (!UUID_PATTERN.test(projectId)) return fail("not-found", projectId);

    let result: Result<null, SyncError>;
    try {
      const skip = await db.withSystem(async (tx) => {
        await lockProject(tx, projectId);
        const eligibility = await getEligibility(tx, projectId);
        if (eligibility.error !== null) return eligibility.error;

        const board = await pmSource.getBoard(eligibility.nodeId);
        const syncedAt = now();
        if (board === null) {
          await freezeProject(tx, projectId, eligibility.nodeId, syncedAt);
        } else {
          await writeBoard(tx, projectId, board, syncedAt);
        }
        return null;
      });
      result = skip === null ? OK : fail(skip, projectId);
    } catch (error) {
      result = await recordFailure(projectId, error);
    }
    return result;
  }

  // Runs after the sync's transaction rolled back, so the mirrored rows are
  // as they were; only the error is written.
  async function recordFailure(
    projectId: string,
    error: unknown,
  ): Promise<Result<null, SyncError>> {
    // Name and code only: a driver error's message carries the failed
    // statement's params (board content). pm-source logs GitHub's side.
    console.error(
      `board-sync: sync of project ${projectId} failed: ${describeError(error)}`,
    );
    const message =
      error instanceof PmSourceError ? error.message : GENERIC_SYNC_ERROR;
    await db.withSystem((tx) =>
      tx
        .update(projects)
        .set({ lastSyncError: message })
        .where(eq(projects.id, projectId)),
    );
    return {
      value: null,
      error: "sync-failed",
      status: STATUS_BY_ERROR["sync-failed"],
    };
  }

  // Trigger fan-out: a failure is recorded on its Project and doesn't stop
  // the others.
  async function syncEach(projectIds: string[]): Promise<void> {
    for (const projectId of projectIds) {
      await syncProject(projectId);
    }
  }

  async function syncEligibleProjects(condition: SQL): Promise<void> {
    if (pmSource === null) return;

    const projectIds = await db.withSystem((tx) =>
      listEligibleProjectIds(tx, condition),
    );
    await syncEach(projectIds);
  }

  const syncBoardByNodeId = (boardNodeId: string): Promise<void> =>
    syncEligibleProjects(sql`${projects.githubProjectNodeId} = ${boardNodeId}`);

  // Hidden task rows count: an issue made Visible again must be picked up.
  const syncBoardsWithIssue = (issueNodeId: string): Promise<void> =>
    syncEligibleProjects(
      sql`exists (select 1 from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.githubIssueNodeId} = ${issueNodeId})`,
    );

  const syncBoardsWithRepository = (repositoryNodeId: string): Promise<void> =>
    syncEligibleProjects(
      sql`exists (select 1 from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.githubRepositoryNodeId} = ${repositoryNodeId})`,
    );

  async function reconcile(): Promise<{
    skipped: boolean;
    synced: number;
    failed: number;
  }> {
    if (pmSource === null) return { skipped: true, synced: 0, failed: 0 };

    // The lock lives as long as this transaction, which stays open (idle)
    // while the syncs run on their own connections.
    return db.withSystem(async (tx) => {
      const [{ isAcquired }] = await tx
        .execute<{ isAcquired: boolean }>(
          sql`select pg_try_advisory_xact_lock(${RECONCILE_LOCK_KEY}) as "isAcquired"`,
        )
        .then((result) => result.rows);
      if (!isAcquired) return { skipped: true, synced: 0, failed: 0 };

      try {
        await refreshPool();
      } catch (error) {
        console.error(
          `board-sync: reconcile pool refresh failed: ${describeError(error)}`,
        );
      }
      const projectIds = await listEligibleProjectIds(tx, sql`true`);
      let synced = 0;
      let failed = 0;
      for (const projectId of projectIds) {
        const result = await syncProject(projectId).catch((error: unknown) => {
          // Recording the failure itself failed (database down).
          console.error(
            `board-sync: reconcile of project ${projectId} failed: ${describeError(error)}`,
          );
          return null;
        });
        if (result?.error === null) {
          synced += 1;
        } else if (result === null || result.error === "sync-failed") {
          failed += 1;
        }
      }
      return { skipped: false, synced, failed };
    });
  }

  async function listUnassignedBoards(): Promise<
    UnassignedBoard[] | "github-off"
  > {
    if (pmSource === null) return "github-off";

    // A board whose only Projects are frozen copies stays unassigned.
    const rows = await db.withSystem((tx) =>
      tx
        .select({ board: githubBoards })
        .from(githubBoards)
        .leftJoin(
          projects,
          and(
            eq(projects.githubProjectNodeId, githubBoards.nodeId),
            isNull(projects.unlinkedAt),
          ),
        )
        .where(isNull(projects.id))
        .orderBy(
          asc(githubBoards.closed),
          asc(sql`lower(${githubBoards.title})`),
          asc(githubBoards.nodeId),
        ),
    );
    return rows.map((row) => toUnassignedBoard(row.board));
  }

  async function getLinkDraft(
    boardNodeId: string,
  ): Promise<Result<LinkDraft, LinkDraftError>> {
    if (pmSource === null) return failLink("github-off", boardNodeId);

    const stored = await db.withSystem(async (tx) => ({
      board: await getPoolBoard(tx, boardNodeId),
      isLinked: await isBoardLinked(tx, boardNodeId),
      frozenMappings: await getFrozenMappings(tx, boardNodeId),
    }));
    if (stored.board === null) return failLink("not-found", boardNodeId);
    if (stored.isLinked) return failLink("already-linked", boardNodeId);

    let result: Result<LinkDraft, LinkDraftError>;
    try {
      const options = await pmSource.getStatusOptions(boardNodeId);
      result =
        options === null
          ? failLink("not-found", boardNodeId)
          : {
              value: {
                board: stored.board,
                options,
                frozenMappings: stored.frozenMappings,
              },
              error: null,
              status: 200,
            };
    } catch (error) {
      if (!(error instanceof PmSourceError)) throw error;
      // pm-source logged GitHub's side.
      result = failLink("github-failed", boardNodeId);
    }
    return result;
  }

  async function link(
    input: LinkInput,
  ): Promise<
    Result<{ projectId: string; firstSyncFailed: boolean }, LinkError>
  > {
    if (pmSource === null) return failLink("github-off", input.boardNodeId);

    const linked = await db.withSystem((tx) => linkInTransaction(tx, input));
    if (linked.error !== null) return failLink(linked.error, input.boardNodeId);

    const sync = await syncProject(linked.projectId);
    return {
      value: {
        projectId: linked.projectId,
        firstSyncFailed: sync.error !== null,
      },
      error: null,
      status: CREATED,
    };
  }

  async function listProjects(clientId: string): Promise<ProjectRow[]> {
    // Postgres would reject a malformed id (22P02); it can't name a Client.
    if (!UUID_PATTERN.test(clientId)) return [];

    const rows = await db.withSystem((tx) =>
      tx
        .select({
          id: projects.id,
          name: projects.name,
          url: projects.url,
          closedOnGithub: projects.closedOnGithub,
          unlinkedAt: projects.unlinkedAt,
          lastSyncedAt: projects.lastSyncedAt,
          lastSyncError: projects.lastSyncError,
          // Unmapped options: mapping rows with no client status.
          unmappedCount: sql<number>`(count(*) filter (where ${projectStatusMappings.id} is not null and ${projectStatusMappings.clientStatus} is null))::int`,
        })
        .from(projects)
        .leftJoin(
          projectStatusMappings,
          eq(projectStatusMappings.projectId, projects.id),
        )
        .where(eq(projects.clientId, clientId))
        .groupBy(projects.id)
        .orderBy(
          sql`${projects.unlinkedAt} is not null`,
          asc(sql`lower(${projects.name})`),
          asc(projects.id),
        ),
    );
    return rows.map(({ closedOnGithub, ...row }) => ({
      ...row,
      state: getProjectState(row.unlinkedAt, closedOnGithub),
    }));
  }

  async function getMapping(projectId: string): Promise<MappingEdit | null> {
    if (!UUID_PATTERN.test(projectId)) return null;

    const rows = await db.withSystem((tx) =>
      tx
        .select({
          projectName: projects.name,
          optionId: projectStatusMappings.githubOptionId,
          optionName: projectStatusMappings.optionName,
          clientStatus: projectStatusMappings.clientStatus,
        })
        .from(projects)
        .leftJoin(
          projectStatusMappings,
          eq(projectStatusMappings.projectId, projects.id),
        )
        .where(eq(projects.id, projectId))
        .orderBy(
          asc(sql`lower(${projectStatusMappings.optionName})`),
          asc(projectStatusMappings.optionName),
        ),
    );
    if (rows.length === 0) return null;

    return {
      projectName: rows[0].projectName,
      // A Project with no options still yields one row, with null option.
      options: rows.flatMap((row) =>
        row.optionId === null || row.optionName === null
          ? []
          : [
              {
                id: row.optionId,
                name: row.optionName,
                clientStatus: row.clientStatus,
              },
            ],
      ),
    };
  }

  async function getBoardDetail(
    clientId: string,
    projectId: string,
  ): Promise<BoardDetail | null> {
    // Postgres would reject a malformed id (22P02); it can't name a Project.
    if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(projectId)) {
      return null;
    }

    return db.withSystem(async (tx) => {
      const [project] = await tx
        .select({
          id: projects.id,
          name: projects.name,
          url: projects.url,
          closedOnGithub: projects.closedOnGithub,
          unlinkedAt: projects.unlinkedAt,
          lastSyncedAt: projects.lastSyncedAt,
          lastSyncError: projects.lastSyncError,
          syncWarnings: projects.syncWarnings,
          clientArchivedAt: clients.archivedAt,
        })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(
          and(eq(projects.id, projectId), eq(projects.clientId, clientId)),
        );
      if (project === undefined) return null;

      // Sequential: one transaction is one connection.
      const [latest] = await tx
        .select({ health: statusUpdates.health })
        .from(statusUpdates)
        .where(eq(statusUpdates.projectId, projectId))
        .orderBy(desc(statusUpdates.githubCreatedAt), desc(statusUpdates.id))
        .limit(1);
      const options = await tx
        .select({
          id: projectStatusMappings.githubOptionId,
          name: projectStatusMappings.optionName,
          clientStatus: projectStatusMappings.clientStatus,
        })
        .from(projectStatusMappings)
        .where(eq(projectStatusMappings.projectId, projectId));
      const milestoneRows = await tx
        .select({
          id: milestones.id,
          title: milestones.title,
          dueDate: milestones.dueDate,
        })
        .from(milestones)
        .where(eq(milestones.projectId, projectId));
      const taskRows = await tx
        .select({
          id: tasks.id,
          title: tasks.title,
          milestoneId: tasks.milestoneId,
          statusOptionId: tasks.statusOptionId,
          targetDate: tasks.targetDate,
          completedAt: tasks.completedAt,
          hiddenAt: tasks.hiddenAt,
        })
        .from(tasks)
        .where(eq(tasks.projectId, projectId));

      return buildBoardDetail({
        project,
        health: latest?.health ?? null,
        options,
        milestoneRows,
        taskRows,
      });
    });
  }

  async function saveMapping(
    projectId: string,
    mapping: Mapping,
  ): Promise<Result<null, SaveMappingError>> {
    if (!UUID_PATTERN.test(projectId)) return failSave("not-found", projectId);

    const refusal = await db.withSystem(async (tx) => {
      const eligibility = await getEligibility(tx, projectId, true);
      if (eligibility.error !== null) return eligibility.error;

      await updateMappings(tx, projectId, mapping);
      return null;
    });
    return refusal === null ? OK_SAVED : failSave(refusal, projectId);
  }

  // Unlink and delete: under the sync's lock, so they never interleave with
  // a running sync (a later one skips the Project). Rows lock project, then
  // client, the order every other path takes.
  async function changeProject(
    projectId: string,
    operation: "unlink" | "delete",
    write: (tx: Tx) => Promise<unknown>,
  ): Promise<Result<null, RemoveError>> {
    // Postgres would reject a malformed id (22P02); it can't name a Project.
    if (!UUID_PATTERN.test(projectId)) {
      return failRemove("not-found", operation, projectId);
    }

    const refusal = await db.withSystem(async (tx) => {
      await lockProject(tx, projectId);
      const lockRefusal = await lockProjectAndClient(tx, projectId);
      if (lockRefusal !== null) return lockRefusal;

      await write(tx);
      return null;
    });
    return refusal === null
      ? OK_REMOVED
      : failRemove(refusal, operation, projectId);
  }

  const unlink = (projectId: string): Promise<Result<null, RemoveError>> =>
    changeProject(projectId, "unlink", (tx) =>
      tx
        .update(projects)
        .set({ unlinkedAt: now() })
        .where(and(eq(projects.id, projectId), isNull(projects.unlinkedAt))),
    );

  const deleteProject = (
    projectId: string,
  ): Promise<Result<null, RemoveError>> =>
    changeProject(projectId, "delete", (tx) =>
      tx.delete(projects).where(eq(projects.id, projectId)),
    );

  return {
    isGithubConnected: pmSource !== null,
    listUnassignedBoards,
    getLinkDraft,
    link,
    listProjects,
    getMapping,
    getBoardDetail,
    saveMapping,
    unlink,
    deleteProject,
    syncNow: syncProject,
    refreshPool,
    syncBoardByNodeId,
    syncBoardsWithIssue,
    syncBoardsWithRepository,
    reconcile,
    syncProject,
  };
}

const OK: Result<null, SyncError> = { value: null, error: null, status: 200 };

function fail(error: SyncError, projectId: string): Result<null, SyncError> {
  console.warn(`board-sync: skipped project ${projectId} (${error})`);
  return { value: null, error, status: STATUS_BY_ERROR[error] };
}

const OK_SAVED: Result<null, SaveMappingError> = {
  value: null,
  error: null,
  status: 200,
};

function failSave(
  error: SaveMappingError,
  projectId: string,
): Result<null, SaveMappingError> {
  console.warn(
    `board-sync: refused to save mapping of ${projectId} (${error})`,
  );
  return { value: null, error, status: STATUS_BY_ERROR[error] };
}

const OK_REMOVED: Result<null, RemoveError> = {
  value: null,
  error: null,
  status: 200,
};

function failRemove(
  error: RemoveError,
  operation: "unlink" | "delete",
  projectId: string,
): Result<null, RemoveError> {
  console.warn(`board-sync: refused to ${operation} ${projectId} (${error})`);
  return { value: null, error, status: STATUS_BY_ERROR[error] };
}

function failLink<E extends LinkDraftError | LinkError>(
  error: E,
  boardNodeId: string,
): Result<never, E> {
  console.warn(`board-sync: refused to link board ${boardNodeId} (${error})`);
  return { value: null, error, status: STATUS_BY_LINK_ERROR[error] };
}

function getProjectState(
  unlinkedAt: Date | null,
  closedOnGithub: boolean,
): ProjectState {
  if (unlinkedAt !== null) return "unlinked";

  return closedOnGithub ? "closed-on-github" : "linked";
}

function toUnassignedBoard(
  row: typeof githubBoards.$inferSelect,
): UnassignedBoard {
  return {
    nodeId: row.nodeId,
    number: row.number,
    title: row.title,
    url: row.url,
    closed: row.closed,
    updatedAt: row.githubUpdatedAt,
  };
}

async function getPoolBoard(
  tx: Tx,
  boardNodeId: string,
): Promise<UnassignedBoard | null> {
  const [row] = await tx
    .select()
    .from(githubBoards)
    .where(eq(githubBoards.nodeId, boardNodeId));
  return row === undefined ? null : toUnassignedBoard(row);
}

async function isBoardLinked(tx: Tx, boardNodeId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.githubProjectNodeId, boardNodeId),
        isNull(projects.unlinkedAt),
      ),
    );
  return rows.length > 0;
}

// Every frozen copy's Client, even one with no mapping rows (a board with
// no Status column), so the drawer can say the link revives it.
async function getFrozenMappings(
  tx: Tx,
  boardNodeId: string,
): Promise<Record<string, Mapping>> {
  const rows = await tx
    .select({
      clientId: projects.clientId,
      optionId: projectStatusMappings.githubOptionId,
      clientStatus: projectStatusMappings.clientStatus,
    })
    .from(projects)
    .leftJoin(
      projectStatusMappings,
      eq(projectStatusMappings.projectId, projects.id),
    )
    .where(
      and(
        eq(projects.githubProjectNodeId, boardNodeId),
        isNotNull(projects.unlinkedAt),
      ),
    );
  return rows.reduce<Record<string, Mapping>>((byClient, row) => {
    const mapping = byClient[row.clientId] ?? {};
    return {
      ...byClient,
      [row.clientId]:
        row.optionId === null
          ? mapping
          : { ...mapping, [row.optionId]: row.clientStatus },
    };
  }, {});
}

type Linked = { error: null; projectId: string } | { error: LinkError };

// Checks, revives or inserts the Project, and writes the drawer's mapping,
// under a lock on the board so two links of it serialize.
async function linkInTransaction(tx: Tx, input: LinkInput): Promise<Linked> {
  const { boardNodeId, clientId } = input;
  await tx.execute(
    sql`select pg_advisory_xact_lock(${BOARD_LOCK_NAMESPACE}, hashtext(${boardNodeId}))`,
  );
  const board = await getPoolBoard(tx, boardNodeId);
  if (board === null) return { error: "not-found" };
  if (await isBoardLinked(tx, boardNodeId)) return { error: "already-linked" };
  // Postgres would reject a malformed id (22P02); it can't name a Client.
  if (!UUID_PATTERN.test(clientId)) return { error: "client-not-found" };

  const [client] = await tx
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, clientId));
  if (client === undefined) return { error: "client-not-found" };
  if (client.archivedAt !== null) return { error: "archived" };

  const projectId = await reviveOrInsertProject(tx, clientId, board);
  await replaceMappings(tx, { projectId, clientId }, input);
  return { error: null, projectId };
}

async function reviveOrInsertProject(
  tx: Tx,
  clientId: string,
  board: UnassignedBoard,
): Promise<string> {
  const [revived] = await tx
    .update(projects)
    .set({ unlinkedAt: null })
    .where(
      and(
        eq(projects.clientId, clientId),
        eq(projects.githubProjectNodeId, board.nodeId),
      ),
    )
    .returning({ id: projects.id });
  if (revived !== undefined) return revived.id;

  const [inserted] = await tx
    .insert(projects)
    .values({
      clientId,
      githubProjectNodeId: board.nodeId,
      githubProjectNumber: board.number,
      name: board.title,
      url: board.url,
      closedOnGithub: board.closed,
    })
    .returning({ id: projects.id });
  return inserted.id;
}

// One row per draft option; null is Unmapped.
async function replaceMappings(
  tx: Tx,
  owner: Owner,
  input: LinkInput,
): Promise<void> {
  const options = keepLastBy(input.options, (option) => option.id);
  await tx
    .delete(projectStatusMappings)
    .where(eq(projectStatusMappings.projectId, owner.projectId));
  if (options.length > 0) {
    await tx.insert(projectStatusMappings).values(
      options.map((option) => ({
        ...owner,
        githubOptionId: option.id,
        optionName: option.name,
        // Own keys only: "constructor" mustn't read Object.prototype.
        clientStatus: Object.hasOwn(input.mapping, option.id)
          ? input.mapping[option.id]
          : null,
      })),
    );
  }
}

// Updates only the options the Project already has: never inserts or
// deletes a mapping row.
async function updateMappings(
  tx: Tx,
  projectId: string,
  mapping: Mapping,
): Promise<void> {
  const stored = await tx
    .select({ optionId: projectStatusMappings.githubOptionId })
    .from(projectStatusMappings)
    .where(eq(projectStatusMappings.projectId, projectId));
  for (const { optionId } of stored) {
    // Own keys only: "constructor" mustn't read Object.prototype.
    if (!Object.hasOwn(mapping, optionId)) continue;

    await tx
      .update(projectStatusMappings)
      .set({ clientStatus: mapping[optionId] })
      .where(
        and(
          eq(projectStatusMappings.projectId, projectId),
          eq(projectStatusMappings.githubOptionId, optionId),
        ),
      );
  }
}

// Linked Projects of non-archived Clients matching `condition`.
async function listEligibleProjectIds(
  tx: Tx,
  condition: SQL,
): Promise<string[]> {
  const rows = await tx
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(
      and(isNull(projects.unlinkedAt), isNull(clients.archivedAt), condition),
    )
    .orderBy(projects.createdAt);
  return rows.map((row) => row.id);
}

// Concurrent syncs of one Project serialize here, so the later one fetches
// (and writes) fresher data.
async function lockProject(tx: Tx, projectId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${PROJECT_LOCK_NAMESPACE}, hashtext(${projectId}))`,
  );
}

// Locks the Project's row, then its Client's (shared: an archive waits, other
// Projects' changes don't). A refusal names why it can't change.
async function lockProjectAndClient(
  tx: Tx,
  projectId: string,
): Promise<RemoveError | null> {
  const [project] = await tx
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("update");
  if (project === undefined) return "not-found";

  const [client] = await tx
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, project.clientId))
    .for("share");
  return client.archivedAt === null ? null : "archived";
}

type Eligibility =
  | { error: null; nodeId: string }
  | { error: "not-found" | "unlinked" | "archived" };

// `shouldLockRow` holds the Project and Client rows until commit, so a
// concurrent archive, freeze or unlink waits for the caller's write instead of racing it.
async function getEligibility(
  tx: Tx,
  projectId: string,
  shouldLockRow = false,
): Promise<Eligibility> {
  const query = tx
    .select({
      nodeId: projects.githubProjectNodeId,
      unlinkedAt: projects.unlinkedAt,
      archivedAt: clients.archivedAt,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId));
  const [row] = await (shouldLockRow
    ? query.for("update", { of: [projects, clients] })
    : query);
  let eligibility: Eligibility;
  if (row === undefined) {
    eligibility = { error: "not-found" };
  } else if (row.unlinkedAt !== null) {
    eligibility = { error: "unlinked" };
  } else if (row.archivedAt !== null) {
    eligibility = { error: "archived" };
  } else {
    eligibility = { error: null, nodeId: row.nodeId };
  }
  return eligibility;
}

// The board was deleted on GitHub: the Project becomes a frozen Past Project
// and nothing else changes.
async function freezeProject(
  tx: Tx,
  projectId: string,
  nodeId: string,
  frozenAt: Date,
): Promise<void> {
  await tx
    .update(projects)
    .set({ unlinkedAt: frozenAt })
    .where(eq(projects.id, projectId));
  await tx.delete(githubBoards).where(eq(githubBoards.nodeId, nodeId));
}

async function writeBoard(
  tx: Tx,
  projectId: string,
  fetched: PmBoard,
  syncedAt: Date,
): Promise<void> {
  const board = dedupeBoard(fetched);
  const [project] = await tx
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId));
  const owner = { projectId, clientId: project.clientId };
  const visibleIssues = board.items.filter(
    (item): item is IssueItem =>
      item.kind === "issue" && item.visibility === "Visible",
  );
  const milestoneDueDates = groupMilestoneDueDates(visibleIssues);

  await tx
    .update(projects)
    .set({
      name: board.title,
      url: board.url,
      githubProjectNumber: board.number,
      closedOnGithub: board.closed,
      lastSyncedAt: syncedAt,
      lastSyncError: null,
      syncWarnings: buildWarnings(board, milestoneDueDates),
    })
    .where(eq(projects.id, projectId));
  await writeMappings(tx, owner, board);
  const milestoneIds = await writeMilestones(tx, owner, milestoneDueDates);
  await writeTasks(tx, owner, visibleIssues, milestoneIds, syncedAt);
  await writeStatusUpdates(tx, owner, board);
}

type Owner = { projectId: string; clientId: string };

// GitHub pages lists by position, so an entry moved between two page fetches
// can come back twice; one upsert can't touch a row twice.
function dedupeBoard(board: PmBoard): PmBoard {
  return {
    ...board,
    statusOptions: keepLastBy(board.statusOptions, (option) => option.id),
    items: keepLastBy(board.items, (item) => item.itemNodeId),
    statusUpdates: keepLastBy(board.statusUpdates, (update) => update.nodeId),
  };
}

// One entry per key, the last one seen winning, in first-seen order.
function keepLastBy<T>(values: T[], getKey: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [getKey(value), value])).values()];
}

async function writeMappings(
  tx: Tx,
  owner: Owner,
  board: PmBoard,
): Promise<void> {
  if (board.statusOptions.length > 0) {
    // A new option starts Unmapped; a rename keeps the Admin's mapping.
    await tx
      .insert(projectStatusMappings)
      .values(
        board.statusOptions.map((option) => ({
          ...owner,
          githubOptionId: option.id,
          optionName: option.name,
          clientStatus: null,
        })),
      )
      .onConflictDoUpdate({
        target: [
          projectStatusMappings.projectId,
          projectStatusMappings.githubOptionId,
        ],
        set: { optionName: sql`excluded.option_name` },
      });
  }
  await tx.delete(projectStatusMappings).where(
    and(
      eq(projectStatusMappings.projectId, owner.projectId),
      notInArray(
        projectStatusMappings.githubOptionId,
        board.statusOptions.map((option) => option.id),
      ),
    ),
  );
}

// Milestone title → its repos' non-null due dates, from Visible issues only,
// so an internal-only milestone never reaches the database.
function groupMilestoneDueDates(
  visibleIssues: IssueItem[],
): Map<string, string[]> {
  return visibleIssues.reduce((byTitle, issue) => {
    if (issue.milestone === null) return byTitle;

    const { title, dueOn } = issue.milestone;
    const dueDates = byTitle.get(title) ?? [];
    const isNewDate = dueOn !== null && !dueDates.includes(dueOn);
    return byTitle.set(title, isNewDate ? [...dueDates, dueOn] : dueDates);
  }, new Map<string, string[]>());
}

// Returns each stored milestone's id by title. Rows no Visible Task uses are
// deleted; the FK nulls hidden tasks' milestone_id.
async function writeMilestones(
  tx: Tx,
  owner: Owner,
  dueDatesByTitle: Map<string, string[]>,
): Promise<Map<string, string>> {
  const titles = [...dueDatesByTitle.keys()];
  const rows =
    titles.length === 0
      ? []
      : await tx
          .insert(milestones)
          .values(
            titles.map((title) => ({
              ...owner,
              title,
              // ISO dates sort as strings; the earliest wins.
              dueDate: dueDatesByTitle.get(title)?.toSorted()[0] ?? null,
            })),
          )
          .onConflictDoUpdate({
            target: [milestones.projectId, milestones.title],
            set: { dueDate: sql`excluded.due_date` },
          })
          .returning({ id: milestones.id, title: milestones.title });
  await tx
    .delete(milestones)
    .where(
      and(
        eq(milestones.projectId, owner.projectId),
        notInArray(milestones.title, titles),
      ),
    );
  return new Map(rows.map((row) => [row.title, row.id]));
}

// Upserts Visible issues as Tasks and soft-hides every other row of the
// Project. Rows are never deleted.
async function writeTasks(
  tx: Tx,
  owner: Owner,
  visibleIssues: IssueItem[],
  milestoneIds: Map<string, string>,
  syncedAt: Date,
): Promise<void> {
  if (visibleIssues.length > 0) {
    await tx
      .insert(tasks)
      .values(
        visibleIssues.map((issue) => ({
          ...owner,
          githubItemNodeId: issue.itemNodeId,
          githubIssueNodeId: issue.issueNodeId,
          githubRepositoryNodeId: issue.repositoryNodeId,
          title: issue.title,
          clientNote: issue.clientNote,
          targetDate: issue.targetDate,
          completedAt: issue.closedAt,
          statusOptionId: issue.statusOptionId,
          milestoneId:
            issue.milestone === null
              ? null
              : (milestoneIds.get(issue.milestone.title) ?? null),
          hiddenAt: null,
        })),
      )
      .onConflictDoUpdate({
        target: [tasks.projectId, tasks.githubItemNodeId],
        set: {
          githubIssueNodeId: sql`excluded.github_issue_node_id`,
          githubRepositoryNodeId: sql`excluded.github_repository_node_id`,
          title: sql`excluded.title`,
          clientNote: sql`excluded.client_note`,
          targetDate: sql`excluded.target_date`,
          completedAt: sql`excluded.completed_at`,
          statusOptionId: sql`excluded.status_option_id`,
          milestoneId: sql`excluded.milestone_id`,
          hiddenAt: null,
        },
      });
  }
  await tx
    .update(tasks)
    .set({ hiddenAt: syncedAt })
    .where(
      and(
        eq(tasks.projectId, owner.projectId),
        isNull(tasks.hiddenAt),
        notInArray(
          tasks.githubItemNodeId,
          visibleIssues.map((issue) => issue.itemNodeId),
        ),
      ),
    );
}

// Mirrored in full: rows deleted on GitHub are deleted here.
async function writeStatusUpdates(
  tx: Tx,
  owner: Owner,
  board: PmBoard,
): Promise<void> {
  if (board.statusUpdates.length > 0) {
    await tx
      .insert(statusUpdates)
      .values(
        board.statusUpdates.map((update) => ({
          ...owner,
          githubNodeId: update.nodeId,
          health: update.health,
          startDate: update.startDate,
          targetDate: update.targetDate,
          body: update.body,
          githubCreatedAt: update.createdAt,
        })),
      )
      .onConflictDoUpdate({
        target: [statusUpdates.projectId, statusUpdates.githubNodeId],
        set: {
          health: sql`excluded.health`,
          startDate: sql`excluded.start_date`,
          targetDate: sql`excluded.target_date`,
          body: sql`excluded.body`,
          githubCreatedAt: sql`excluded.github_created_at`,
        },
      });
  }
  await tx.delete(statusUpdates).where(
    and(
      eq(statusUpdates.projectId, owner.projectId),
      notInArray(
        statusUpdates.githubNodeId,
        board.statusUpdates.map((update) => update.nodeId),
      ),
    ),
  );
}

// PRs and drafts are silently not Tasks, so they never warn.
function buildWarnings(
  board: PmBoard,
  milestoneDueDates: Map<string, string[]>,
): SyncWarning[] {
  const requiredFields: { isPresent: boolean; field: MissingField }[] = [
    { isPresent: board.fields.clientVisibility, field: "Client visibility" },
    { isPresent: board.fields.clientNote, field: "Client note" },
    { isPresent: board.fields.targetDate, field: "Target date" },
  ];
  const missingFields: SyncWarning[] = requiredFields
    .filter(({ isPresent }) => !isPresent)
    .map(({ field }) => ({ kind: "missing-field", field }));
  const dateMismatches: SyncWarning[] = [...milestoneDueDates]
    .filter(([, dueDates]) => dueDates.length > 1)
    .map(([title, dueDates]) => ({
      kind: "milestone-date-mismatch",
      title,
      dueDates: dueDates.toSorted(),
    }));
  const unreadableCount = board.items.filter(
    (item) => item.kind === "unreadable",
  ).length;
  const unreadable: SyncWarning[] =
    unreadableCount > 0
      ? [{ kind: "unreadable-items", count: unreadableCount }]
      : [];
  return [...missingFields, ...dateMismatches, ...unreadable];
}

type DetailInput = {
  project: {
    id: string;
    name: string;
    url: string;
    closedOnGithub: boolean;
    unlinkedAt: Date | null;
    lastSyncedAt: Date | null;
    lastSyncError: string | null;
    syncWarnings: SyncWarning[];
    clientArchivedAt: Date | null;
  };
  health: Health | null;
  options: { id: string; name: string; clientStatus: ClientStatus | null }[];
  milestoneRows: { id: string; title: string; dueDate: string | null }[];
  taskRows: {
    id: string;
    title: string;
    milestoneId: string | null;
    statusOptionId: string | null;
    targetDate: string | null;
    completedAt: Date | null;
    hiddenAt: Date | null;
  }[];
};

// The Client read model's rules, applied to the Admin's rows.
function buildBoardDetail(input: DetailInput): BoardDetail {
  const { project, options, milestoneRows, taskRows } = input;
  const mapping = new Map(
    options.map((option) => [option.id, option.clientStatus]),
  );
  const optionNames = new Map(
    options.map((option) => [option.id, option.name]),
  );
  const visibleTasks = taskRows
    .filter((task) => task.hiddenAt === null)
    .map((task) => ({
      ...task,
      clientStatus: getClientStatus(task.statusOptionId, mapping),
    }));
  type VisibleTask = (typeof visibleTasks)[number];
  const tasksIn = (milestoneId: string | null): VisibleTask[] =>
    visibleTasks.filter((task) => task.milestoneId === milestoneId);
  // A Milestone whose Tasks are all hidden isn't shown to the Client.
  const shownMilestones = sortMilestones(milestoneRows)
    .map((milestone) => ({ ...milestone, tasks: tasksIn(milestone.id) }))
    .filter((milestone) => milestone.tasks.length > 0);
  const toBoardTask =
    (milestoneTitle: string | null) =>
    (task: VisibleTask): BoardTask => ({
      id: task.id,
      title: task.title,
      clientStatus: task.clientStatus,
      optionName:
        task.statusOptionId === null
          ? null
          : (optionNames.get(task.statusOptionId) ?? null),
      milestoneTitle,
      targetDate: task.targetDate,
    });
  const orderedTasks = [
    ...shownMilestones.flatMap((milestone) =>
      inClientOrder(milestone.tasks).map(toBoardTask(milestone.title)),
    ),
    ...inClientOrder(tasksIn(null)).map(toBoardTask(null)),
  ];

  return {
    id: project.id,
    name: project.name,
    url: project.url,
    state: getProjectState(project.unlinkedAt, project.closedOnGithub),
    unlinkedAt: project.unlinkedAt,
    isClientArchived: project.clientArchivedAt !== null,
    lastSyncedAt: project.lastSyncedAt,
    lastSyncError: project.lastSyncError,
    syncWarnings: project.syncWarnings,
    unmappedCount: options.filter((option) => option.clientStatus === null)
      .length,
    health: input.health,
    fieldChecks: getFieldChecks(project.lastSyncedAt, project.syncWarnings),
    milestones: shownMilestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      dueDate: milestone.dueDate,
      progress: getProgress(milestone.tasks.map((task) => task.clientStatus)),
    })),
    tasks: orderedTasks,
    hiddenCount: taskRows.length - visibleTasks.length,
  };
}

// Up next, In progress, then Done, each in the Client's order.
function inClientOrder<
  T extends {
    title: string;
    clientStatus: ClientStatus;
    targetDate: string | null;
    completedAt: Date | null;
  },
>(group: T[]): T[] {
  const groups = groupTasks(group);
  return [...groups.UP_NEXT, ...groups.IN_PROGRESS, ...groups.DONE];
}

function getFieldChecks(
  lastSyncedAt: Date | null,
  warnings: SyncWarning[],
): BoardDetail["fieldChecks"] {
  const missing = new Set(
    warnings.flatMap((warning) =>
      warning.kind === "missing-field" ? [warning.field] : [],
    ),
  );
  const checkOf = (field: RequiredField): FieldCheck => {
    if (lastSyncedAt === null) return "not-checked";

    return missing.has(field) ? "missing" : "present";
  };
  return REQUIRED_FIELDS.map((field) => ({ field, check: checkOf(field) }));
}
