import { and, eq, isNull, notInArray, sql, type SQL } from "drizzle-orm";
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
import { describeError } from "@/lib/describe-error";
import {
  PmSourceError,
  type PmBoard,
  type PmItem,
  type PmSource,
} from "@/lib/pm-source/pm-source";
import type { Result } from "@/lib/result";

// The board-sync module: the only caller of PmSource and the only writer of
// the board mirror tables (github_boards, projects, status_updates,
// milestones, tasks, project_status_mappings). Every write runs as
// app_system.

export type ClientStatus = (typeof taskClientStatus.enumValues)[number];

export type SyncError =
  "github-off" | "not-found" | "unlinked" | "archived" | "sync-failed";

export type BoardSync = {
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

type IssueItem = Extract<PmItem, { kind: "issue" }>;
type MissingField = Extract<SyncWarning, { kind: "missing-field" }>["field"];

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

  return {
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

type Eligibility =
  | { error: null; nodeId: string }
  | { error: "not-found" | "unlinked" | "archived" };

async function getEligibility(tx: Tx, projectId: string): Promise<Eligibility> {
  const [row] = await tx
    .select({
      nodeId: projects.githubProjectNodeId,
      unlinkedAt: projects.unlinkedAt,
      archivedAt: clients.archivedAt,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId));
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
