import { and, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  type ClientStatus,
  getClientStatus,
} from "@/lib/board-sync/board-sync";
import {
  type Health,
  isPastProject,
  sortProjects,
} from "@/lib/client-projects/client-project-rules";
import type { Db, Tx } from "@/lib/db/db";
import {
  clients,
  organization,
  projects,
  projectStatusMappings,
  requests,
  statusUpdates,
  tasks,
  user,
} from "@/lib/db/schema";
import { getDisplayName } from "@/lib/display-name";
import {
  buildTaskOptionGroups,
  type FieldErrors,
  type LinkedTask,
  type RequestDraft,
  type RequestKind,
  type RequestStatus,
  type TaskOptionGroup,
  toLinkedTask,
  type TriageInput,
  validateDraft,
  validateTriage,
} from "@/lib/requests/request-rules";
import type { Result } from "@/lib/result";

// Requests, for the Client and for the Admin. The Client side runs as
// app_tenant and names its columns: the grants refuse anything else, and RLS
// keeps other Clients' Requests and hidden Tasks out. Each read also filters
// on client_id itself, so a policy regression alone can't leak them. The
// Admin side runs as app_system and scopes by client_id explicitly.

export type RequestRow = {
  id: string;
  kind: RequestKind;
  title: string;
  status: RequestStatus;
  submitterName: string;
  createdAt: Date;
};

type RequestFacts = RequestRow & {
  description: string;
  statusChangedAt: Date;
  responseNote: string | null;
  project: { id: string; name: string } | null;
};

export type RequestDetail = RequestFacts & {
  task: LinkedTask | null;
  // New, and the actor submitted it: they may edit or withdraw it.
  canChange: boolean;
};

export type AdminRequestRow = RequestRow & {
  clientId: string;
  clientName: string;
};

export type AdminRequestDetail = RequestFacts & {
  clientId: string;
  clientName: string;
  clientArchived: boolean;
  submitterEmail: string;
  // The live title while the Task exists, else the last one saved.
  taskId: string | null;
  taskTitle: string | null;
  // The Task exists and isn't hidden: the Client sees it live.
  taskTracked: boolean;
};

export type ProjectOption = { id: string; name: string; isPast: boolean };

// The signed-in Client User and their Client.
export type Actor = { clientId: string; userId: string };

// An archived Client's Requests are read-only, as in triage.
export type SubmitError = "invalid" | "archived";
export type EditError = "invalid" | "archived" | "not-found" | "not-new";
export type WithdrawError = "archived" | "not-found" | "not-new";
// Field errors ride along with the Result: empty unless `invalid`.
export type DraftResult<T> = Result<T, SubmitError> & {
  fieldErrors: FieldErrors;
};
export type EditResult = Result<null, EditError> & {
  fieldErrors: FieldErrors;
};
export type TriageError =
  "invalid" | "not-found" | "withdrawn" | "archived" | "task-not-found";

export type Requests = {
  // Client side (app_tenant).
  // Newest first. `limit` is clamped to 1–MAX_LIST_LIMIT.
  listRequests(
    clientId: string,
    options?: { limit?: number },
  ): Promise<RequestRow[]>;
  countNewRequests(clientId: string): Promise<number>;
  // Null for another Client's Request, an unknown id or a non-UUID id.
  getRequest(actor: Actor, requestId: string): Promise<RequestDetail | null>;
  // Active A–Z, then Past A–Z.
  listProjectOptions(clientId: string): Promise<ProjectOption[]>;
  submitRequest(
    actor: Actor,
    draft: RequestDraft,
  ): Promise<DraftResult<{ id: string }>>;
  editRequest(
    actor: Actor,
    requestId: string,
    draft: RequestDraft,
  ): Promise<EditResult>;
  withdrawRequest(
    actor: Actor,
    requestId: string,
  ): Promise<Result<null, WithdrawError>>;

  // Admin side (app_system).
  // Active Clients only, newest first. `new`: status New only.
  listInbox(filter: "new" | "all"): Promise<AdminRequestRow[]>;
  // Any Client, archived included. Newest first.
  listClientRequests(clientId: string): Promise<RequestRow[]>;
  // Null for an unknown or non-UUID id, or one not of `clientId` when given.
  getAdminRequest(
    requestId: string,
    clientId?: string,
  ): Promise<AdminRequestDetail | null>;
  listTaskOptions(
    clientId: string,
    requestProjectId: string | null,
  ): Promise<TaskOptionGroup[]>;
  triageRequest(
    requestId: string,
    input: TriageInput,
  ): Promise<Result<null, TriageError>>;
  // Active Clients with at least one New Request, by Client id.
  countNewByClient(): Promise<Record<string, number>>;
  // Active Clients' Project options, by Client id; a Client without
  // Projects is absent. Ordered as listProjectOptions.
  listProjectOptionsByClient(): Promise<Record<string, ProjectOption[]>>;
};

type RequestsDeps = { db: Db };

type Submitter = { name: string; email: string };

// What the Admin side reads for a row: the submitter comes joined.
type AdminRowFields = {
  id: string;
  kind: RequestKind;
  title: string;
  status: RequestStatus;
  createdAt: Date;
  clientId: string;
  clientName: string;
  submitterUserName: string;
  submitterEmail: string;
};

// Shape check only, as in db.ts: a non-UUID id can't name a row, and Postgres
// would reject it as a uuid.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BY_ERROR = {
  invalid: 422,
  "not-found": 404,
  "not-new": 409,
  withdrawn: 409,
  archived: 409,
  "task-not-found": 422,
} as const;

const NO_FIELD_ERRORS: FieldErrors = {};

// The most rows one limited listRequests call returns.
export const MAX_LIST_LIMIT = 100;

const ROW_COLUMNS = {
  id: requests.id,
  kind: requests.kind,
  title: requests.title,
  status: requests.status,
  submitterId: requests.submitterId,
  createdAt: requests.createdAt,
};

const ACTIVE_CLIENT = isNull(clients.archivedAt);

function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

// A Project's facts for the Project select, with its Client.
function selectProjectFacts(tx: Tx) {
  return tx
    .select({
      id: projects.id,
      clientId: projects.clientId,
      name: projects.name,
      closedOnGithub: projects.closedOnGithub,
      unlinkedAt: projects.unlinkedAt,
    })
    .from(projects)
    .$dynamic();
}

// One row per Project: its newest Status Update's health. Ordered for
// DISTINCT ON, so callers only add joins and a filter.
function selectLatestHealth(tx: Tx) {
  return tx
    .selectDistinctOn([statusUpdates.projectId], {
      projectId: statusUpdates.projectId,
      health: statusUpdates.health,
    })
    .from(statusUpdates)
    .orderBy(
      statusUpdates.projectId,
      desc(statusUpdates.githubCreatedAt),
      desc(statusUpdates.id),
    )
    .$dynamic();
}

// Active A–Z, then Past A–Z. `latestRows` may cover other Projects too.
function toProjectOptions(
  projectRows: readonly {
    id: string;
    name: string;
    closedOnGithub: boolean;
    unlinkedAt: Date | null;
  }[],
  latestRows: readonly { projectId: string; health: Health | null }[],
): ProjectOption[] {
  const healthByProject = new Map(
    latestRows.map((row) => [row.projectId, row.health]),
  );
  return sortProjects(
    projectRows.map((project) => ({
      id: project.id,
      name: project.name,
      isPast: isPastProject({
        latestHealth: healthByProject.get(project.id) ?? null,
        closedOnGithub: project.closedOnGithub,
        unlinkedAt: project.unlinkedAt,
      }),
    })),
  );
}

// A positive integer up to MAX_LIST_LIMIT, whatever a caller passes.
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_LIST_LIMIT;

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

// The session gate signs an archived Client's users out; this is the
// module's own check, so a gate regression can't reopen writes. A plain read:
// app_tenant can't lock clients rows (FOR SHARE needs UPDATE).
async function isClientArchived(tx: Tx, clientId: string): Promise<boolean> {
  const [row] = await tx
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, clientId));
  return row === undefined || row.archivedAt !== null;
}

function fail<E extends keyof typeof STATUS_BY_ERROR>(
  operation: string,
  error: E,
  context: Record<string, string>,
): Result<never, E> {
  console.warn(`requests: ${operation} refused (${error})`, context);
  return { value: null, error, status: STATUS_BY_ERROR[error] };
}

// One system read of the submitters behind tenant rows: app_tenant can't read
// `user`. A removed Client User still has their row (users are never
// deleted), so their name still shows.
async function readSubmitters(
  db: Db,
  userIds: string[],
): Promise<Map<string, Submitter>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();

  const rows = await db.withSystem((tx) =>
    tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, ids)),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function getSubmitterName(
  submitters: Map<string, Submitter>,
  submitterId: string,
): string {
  const submitter = submitters.get(submitterId);
  // The FK makes a missing row impossible; the id beats a crash.
  return submitter === undefined
    ? submitterId
    : getDisplayName(submitter.name, submitter.email);
}

function readClientProjectIds(tx: Tx, clientId: string): Promise<string[]> {
  return tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.clientId, clientId))
    .then((rows) => rows.map((row) => row.id));
}

// The Task as the Client sees it: RLS hides hidden Tasks from app_tenant.
async function readLiveTask(
  tx: Tx,
  clientId: string,
  taskId: string,
): Promise<{
  title: string;
  clientStatus: ClientStatus;
  projectId: string;
  projectName: string;
} | null> {
  const [task] = await tx
    .select({
      title: tasks.title,
      statusOptionId: tasks.statusOptionId,
      projectId: tasks.projectId,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), eq(tasks.clientId, clientId)));
  if (task === undefined) return null;

  // Through the tenant grants: never option_name.
  const mappingRows = await tx
    .select({
      githubOptionId: projectStatusMappings.githubOptionId,
      clientStatus: projectStatusMappings.clientStatus,
    })
    .from(projectStatusMappings)
    .where(
      and(
        eq(projectStatusMappings.clientId, clientId),
        eq(projectStatusMappings.projectId, task.projectId),
      ),
    );
  const mapping = new Map(
    mappingRows.map((row) => [row.githubOptionId, row.clientStatus]),
  );
  return {
    title: task.title,
    clientStatus: getClientStatus(task.statusOptionId, mapping),
    projectId: task.projectId,
    projectName: task.projectName,
  };
}

export function createRequests(deps: RequestsDeps): Requests {
  const { db } = deps;

  async function listRequests(
    clientId: string,
    options: { limit?: number } = {},
  ): Promise<RequestRow[]> {
    const rows = await db.withTenant(clientId, (tx) => {
      const query = tx
        .select(ROW_COLUMNS)
        .from(requests)
        .where(eq(requests.clientId, clientId))
        .orderBy(desc(requests.createdAt), desc(requests.id));
      return options.limit === undefined
        ? query
        : query.limit(clampLimit(options.limit));
    });
    const submitters = await readSubmitters(
      db,
      rows.map((row) => row.submitterId),
    );
    return rows.map(({ submitterId, ...row }) => ({
      ...row,
      submitterName: getSubmitterName(submitters, submitterId),
    }));
  }

  async function countNewRequests(clientId: string): Promise<number> {
    const [row] = await db.withTenant(clientId, (tx) =>
      tx
        .select({ total: count() })
        .from(requests)
        .where(
          and(eq(requests.clientId, clientId), eq(requests.status, "NEW")),
        ),
    );
    return row?.total ?? 0;
  }

  async function getRequest(
    actor: Actor,
    requestId: string,
  ): Promise<RequestDetail | null> {
    if (!isUuid(requestId)) return null;

    const { clientId } = actor;
    const found = await db.withTenant(clientId, async (tx) => {
      const [row] = await tx
        .select({
          ...ROW_COLUMNS,
          description: requests.description,
          statusChangedAt: requests.statusChangedAt,
          responseNote: requests.responseNote,
          projectId: requests.projectId,
          projectName: projects.name,
          taskId: requests.taskId,
          taskTitle: requests.taskTitle,
        })
        .from(requests)
        .leftJoin(
          projects,
          and(
            eq(projects.id, requests.projectId),
            eq(projects.clientId, clientId),
          ),
        )
        .where(
          and(eq(requests.id, requestId), eq(requests.clientId, clientId)),
        );
      if (row === undefined) return null;

      const live =
        row.taskId === null
          ? null
          : await readLiveTask(tx, clientId, row.taskId);
      return { row, live };
    });
    if (found === null) return null;

    const { row, live } = found;
    const submitters = await readSubmitters(db, [row.submitterId]);
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      submitterName: getSubmitterName(submitters, row.submitterId),
      createdAt: row.createdAt,
      description: row.description,
      statusChangedAt: row.statusChangedAt,
      responseNote: row.responseNote,
      project:
        row.projectId === null || row.projectName === null
          ? null
          : { id: row.projectId, name: row.projectName },
      task: toLinkedTask(row.taskTitle, live),
      canChange: row.status === "NEW" && row.submitterId === actor.userId,
    };
  }

  async function listProjectOptions(
    clientId: string,
  ): Promise<ProjectOption[]> {
    return db.withTenant(clientId, async (tx) => {
      const projectRows = await selectProjectFacts(tx).where(
        eq(projects.clientId, clientId),
      );
      const latestRows = await selectLatestHealth(tx).where(
        eq(statusUpdates.clientId, clientId),
      );
      return toProjectOptions(projectRows, latestRows);
    });
  }

  async function listProjectOptionsByClient(): Promise<
    Record<string, ProjectOption[]>
  > {
    return db.withSystem(async (tx) => {
      const projectRows = await selectProjectFacts(tx)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(ACTIVE_CLIENT);
      const latestRows = await selectLatestHealth(tx)
        .innerJoin(clients, eq(clients.id, statusUpdates.clientId))
        .where(ACTIVE_CLIENT);
      const clientIds = new Set(projectRows.map((project) => project.clientId));
      return Object.fromEntries(
        Array.from(clientIds, (clientId) => [
          clientId,
          toProjectOptions(
            projectRows.filter((project) => project.clientId === clientId),
            latestRows,
          ),
        ]),
      );
    });
  }

  async function submitRequest(
    actor: Actor,
    draft: RequestDraft,
  ): Promise<DraftResult<{ id: string }>> {
    const { clientId, userId } = actor;
    const outcome = await db.withTenant(
      clientId,
      async (
        tx,
      ): Promise<
        | { error: SubmitError; fieldErrors: FieldErrors }
        | { error: null; id: string }
      > => {
        if (await isClientArchived(tx, clientId)) {
          return { error: "archived", fieldErrors: NO_FIELD_ERRORS };
        }
        const validation = validateDraft(
          draft,
          await readClientProjectIds(tx, clientId),
        );
        if (!validation.isValid) {
          return { error: "invalid", fieldErrors: validation.fieldErrors };
        }

        const valid = validation.draft;
        // Explicit columns: Drizzle's insert() sends `default` for every
        // other column, and app_tenant may insert only these (42501).
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into ${requests}
            (client_id, project_id, submitter_id, kind, title, description)
          values
            (${clientId}, ${valid.projectId}, ${userId}, ${valid.kind},
             ${valid.title}, ${valid.description})
          returning id`);
        return { error: null, id: inserted.rows[0].id };
      },
      { userId },
    );

    let result: DraftResult<{ id: string }>;
    if (outcome.error === null) {
      result = {
        value: { id: outcome.id },
        error: null,
        status: 201,
        fieldErrors: NO_FIELD_ERRORS,
      };
    } else {
      result = {
        ...fail("submit", outcome.error, { clientId, userId }),
        fieldErrors: outcome.fieldErrors,
      };
    }
    return result;
  }

  // Why the actor can't change this Request, or null when they can:
  // `archived` for an archived Client, `not-found` when the Request isn't
  // visible or isn't the actor's, `not-new` when it is theirs but left New.
  async function checkChangeable(
    tx: Tx,
    actor: Actor,
    requestId: string,
  ): Promise<WithdrawError | null> {
    if (await isClientArchived(tx, actor.clientId)) return "archived";

    const [row] = await tx
      .select({ submitterId: requests.submitterId, status: requests.status })
      .from(requests)
      .where(
        and(eq(requests.id, requestId), eq(requests.clientId, actor.clientId)),
      );
    let refusal: WithdrawError | null = null;
    if (row === undefined || row.submitterId !== actor.userId) {
      refusal = "not-found";
    } else if (row.status !== "NEW") {
      refusal = "not-new";
    }
    return refusal;
  }

  // After the guarded write changed nothing (another write won a race): the
  // same reasons, read again.
  async function explainRefusal(
    tx: Tx,
    actor: Actor,
    requestId: string,
  ): Promise<WithdrawError> {
    return (await checkChangeable(tx, actor, requestId)) ?? "not-new";
  }

  // The one guarded UPDATE behind edit and withdraw. The requests_tenant_update
  // policy repeats the guard; this one makes the refusal explainable.
  function updateOwnNewRequest(
    tx: Tx,
    actor: Actor,
    requestId: string,
    changes: Partial<typeof requests.$inferInsert>,
  ): Promise<{ id: string }[]> {
    return tx
      .update(requests)
      .set(changes)
      .where(
        and(
          eq(requests.id, requestId),
          eq(requests.clientId, actor.clientId),
          eq(requests.status, "NEW"),
          eq(requests.submitterId, actor.userId),
        ),
      )
      .returning({ id: requests.id });
  }

  async function editRequest(
    actor: Actor,
    requestId: string,
    draft: RequestDraft,
  ): Promise<EditResult> {
    const context = { requestId, userId: actor.userId };
    if (!isUuid(requestId)) {
      return {
        ...fail("edit", "not-found", context),
        fieldErrors: NO_FIELD_ERRORS,
      };
    }

    // Refusals that make the draft moot (another user's Request, a stale
    // drawer) come before field errors.
    const outcome = await db.withTenant(
      actor.clientId,
      async (
        tx,
      ): Promise<{ error: EditError | null; fieldErrors: FieldErrors }> => {
        const refusal = await checkChangeable(tx, actor, requestId);
        if (refusal !== null) {
          return { error: refusal, fieldErrors: NO_FIELD_ERRORS };
        }
        const validation = validateDraft(
          draft,
          await readClientProjectIds(tx, actor.clientId),
        );
        if (!validation.isValid) {
          return { error: "invalid", fieldErrors: validation.fieldErrors };
        }

        const updated = await updateOwnNewRequest(tx, actor, requestId, {
          kind: validation.draft.kind,
          title: validation.draft.title,
          description: validation.draft.description,
          projectId: validation.draft.projectId,
        });
        return {
          error:
            updated.length > 0
              ? null
              : await explainRefusal(tx, actor, requestId),
          fieldErrors: NO_FIELD_ERRORS,
        };
      },
      { userId: actor.userId },
    );

    let result: EditResult;
    if (outcome.error !== null) {
      result = {
        ...fail("edit", outcome.error, context),
        fieldErrors: outcome.fieldErrors,
      };
    } else {
      result = {
        value: null,
        error: null,
        status: 200,
        fieldErrors: NO_FIELD_ERRORS,
      };
    }
    return result;
  }

  async function withdrawRequest(
    actor: Actor,
    requestId: string,
  ): Promise<Result<null, WithdrawError>> {
    const context = { requestId, userId: actor.userId };
    if (!isUuid(requestId)) return fail("withdraw", "not-found", context);

    // Status only: the requests_status_changed_at trigger stamps the time.
    const error = await db.withTenant(
      actor.clientId,
      async (tx) => {
        if (await isClientArchived(tx, actor.clientId)) return "archived";

        const updated = await updateOwnNewRequest(tx, actor, requestId, {
          status: "WITHDRAWN",
        });
        return updated.length > 0 ? null : explainRefusal(tx, actor, requestId);
      },
      { userId: actor.userId },
    );
    return error === null
      ? { value: null, error: null, status: 200 }
      : fail("withdraw", error, context);
  }

  // Admin side.

  const ADMIN_ROW_COLUMNS = {
    ...ROW_COLUMNS,
    clientId: requests.clientId,
    clientName: organization.name,
    submitterUserName: user.name,
    submitterEmail: user.email,
  };

  function toRequestRow(row: AdminRowFields): RequestRow {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      submitterName: getDisplayName(row.submitterUserName, row.submitterEmail),
      createdAt: row.createdAt,
    };
  }

  function toAdminRow(row: AdminRowFields): AdminRequestRow {
    return {
      ...toRequestRow(row),
      clientId: row.clientId,
      clientName: row.clientName,
    };
  }

  function selectAdminRows(tx: Tx) {
    return tx
      .select(ADMIN_ROW_COLUMNS)
      .from(requests)
      .innerJoin(clients, eq(clients.id, requests.clientId))
      .innerJoin(organization, eq(organization.id, requests.clientId))
      .innerJoin(user, eq(user.id, requests.submitterId));
  }

  async function listInbox(filter: "new" | "all"): Promise<AdminRequestRow[]> {
    const rows = await db.withSystem((tx) =>
      selectAdminRows(tx)
        .where(
          and(
            ACTIVE_CLIENT,
            filter === "new" ? eq(requests.status, "NEW") : undefined,
          ),
        )
        .orderBy(desc(requests.createdAt), desc(requests.id)),
    );
    return rows.map(toAdminRow);
  }

  async function listClientRequests(clientId: string): Promise<RequestRow[]> {
    if (!isUuid(clientId)) return [];

    const rows = await db.withSystem((tx) =>
      selectAdminRows(tx)
        .where(eq(requests.clientId, clientId))
        .orderBy(desc(requests.createdAt), desc(requests.id)),
    );
    return rows.map(toRequestRow);
  }

  async function getAdminRequest(
    requestId: string,
    clientId?: string,
  ): Promise<AdminRequestDetail | null> {
    if (!isUuid(requestId)) return null;
    if (clientId !== undefined && !isUuid(clientId)) return null;

    const [row] = await db.withSystem((tx) =>
      tx
        .select({
          ...ADMIN_ROW_COLUMNS,
          clientArchivedAt: clients.archivedAt,
          description: requests.description,
          statusChangedAt: requests.statusChangedAt,
          responseNote: requests.responseNote,
          projectId: requests.projectId,
          projectName: projects.name,
          taskId: requests.taskId,
          taskTitle: requests.taskTitle,
          liveTaskTitle: tasks.title,
          liveTaskHiddenAt: tasks.hiddenAt,
        })
        .from(requests)
        .innerJoin(clients, eq(clients.id, requests.clientId))
        .innerJoin(organization, eq(organization.id, requests.clientId))
        .innerJoin(user, eq(user.id, requests.submitterId))
        .leftJoin(
          projects,
          and(
            eq(projects.id, requests.projectId),
            eq(projects.clientId, requests.clientId),
          ),
        )
        .leftJoin(
          tasks,
          and(
            eq(tasks.id, requests.taskId),
            eq(tasks.clientId, requests.clientId),
          ),
        )
        .where(
          and(
            eq(requests.id, requestId),
            clientId === undefined
              ? undefined
              : eq(requests.clientId, clientId),
          ),
        ),
    );
    if (row === undefined) return null;

    return {
      ...toAdminRow(row),
      description: row.description,
      statusChangedAt: row.statusChangedAt,
      responseNote: row.responseNote,
      project:
        row.projectId === null || row.projectName === null
          ? null
          : { id: row.projectId, name: row.projectName },
      clientArchived: row.clientArchivedAt !== null,
      submitterEmail: row.submitterEmail,
      taskId: row.taskId,
      taskTitle: row.liveTaskTitle ?? row.taskTitle,
      taskTracked: row.liveTaskTitle !== null && row.liveTaskHiddenAt === null,
    };
  }

  async function listTaskOptions(
    clientId: string,
    requestProjectId: string | null,
  ): Promise<TaskOptionGroup[]> {
    if (!isUuid(clientId)) return [];

    return db.withSystem(async (tx) => {
      const projectRows = await tx
        .select({
          id: projects.id,
          name: projects.name,
          unlinkedAt: projects.unlinkedAt,
        })
        .from(projects)
        .where(eq(projects.clientId, clientId));
      const taskRows = await tx
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          title: tasks.title,
          hiddenAt: tasks.hiddenAt,
        })
        .from(tasks)
        .where(eq(tasks.clientId, clientId));
      return buildTaskOptionGroups(projectRows, taskRows, requestProjectId);
    });
  }

  // Why a triage write was refused. Checked in the order the Admin would fix
  // them: an unknown Request, then a read-only one, then the Task pick.
  async function explainTriageRefusal(
    tx: Tx,
    requestId: string,
  ): Promise<"not-found" | "withdrawn" | "archived" | null> {
    const [row] = await tx
      .select({ status: requests.status, archivedAt: clients.archivedAt })
      .from(requests)
      .innerJoin(clients, eq(clients.id, requests.clientId))
      .where(eq(requests.id, requestId));

    let refusal: "not-found" | "withdrawn" | "archived" | null = null;
    if (row === undefined) {
      refusal = "not-found";
    } else if (row.status === "WITHDRAWN") {
      refusal = "withdrawn";
    } else if (row.archivedAt !== null) {
      refusal = "archived";
    }
    return refusal;
  }

  async function triageRequest(
    requestId: string,
    input: TriageInput,
  ): Promise<Result<null, TriageError>> {
    const context = { requestId };
    if (!isUuid(requestId)) return fail("triage", "not-found", context);
    const validation = validateTriage(input);
    if (!validation.isValid) return fail("triage", "invalid", context);

    const { status, responseNote, taskId } = validation.triage;
    const error = await db.withSystem(
      async (tx): Promise<TriageError | null> => {
        // The Task must be one of the Request's Client's (hidden ones and
        // those of frozen Projects allowed). Its current title is the
        // snapshot, re-copied on every save.
        let taskTitle: string | null = null;
        if (taskId !== null) {
          const [task] = isUuid(taskId)
            ? await tx
                .select({ title: tasks.title })
                .from(tasks)
                .innerJoin(requests, eq(requests.clientId, tasks.clientId))
                .where(and(eq(tasks.id, taskId), eq(requests.id, requestId)))
                // Held to commit, so the Task can't be deleted before the
                // UPDATE below links it (requests_task_fk would refuse).
                .for("share", { of: tasks })
            : [];
          if (task === undefined) {
            return (
              (await explainTriageRefusal(tx, requestId)) ?? "task-not-found"
            );
          }
          taskTitle = task.title;
        }

        // One guarded write: never a Withdrawn Request or an archived
        // Client's. The requests_status_changed_at trigger moves
        // status_changed_at when the status changes.
        const updated = await tx
          .update(requests)
          .set({ status, responseNote, taskId, taskTitle })
          .where(
            and(
              eq(requests.id, requestId),
              ne(requests.status, "WITHDRAWN"),
              inArray(
                requests.clientId,
                tx
                  .select({ id: clients.id })
                  .from(clients)
                  .where(ACTIVE_CLIENT),
              ),
            ),
          )
          .returning({ id: requests.id });
        return updated.length > 0
          ? null
          : ((await explainTriageRefusal(tx, requestId)) ?? "not-found");
      },
    );
    return error === null
      ? { value: null, error: null, status: 200 }
      : fail("triage", error, context);
  }

  async function countNewByClient(): Promise<Record<string, number>> {
    const rows = await db.withSystem((tx) =>
      tx
        .select({ clientId: requests.clientId, total: count() })
        .from(requests)
        .innerJoin(clients, eq(clients.id, requests.clientId))
        .where(and(ACTIVE_CLIENT, eq(requests.status, "NEW")))
        .groupBy(requests.clientId),
    );
    return Object.fromEntries(rows.map((row) => [row.clientId, row.total]));
  }

  return {
    listRequests,
    countNewRequests,
    getRequest,
    listProjectOptions,
    listProjectOptionsByClient,
    submitRequest,
    editRequest,
    withdrawRequest,
    listInbox,
    listClientRequests,
    getAdminRequest,
    listTaskOptions,
    triageRequest,
    countNewByClient,
  };
}
