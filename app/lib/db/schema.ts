import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type CheckBuilder,
  type PgColumn,
  type PgPolicy,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export * from "./auth-schema";

// Unset or empty app.client_id becomes NULL, so the check matches no row and
// allows no write (ADR 0003).
const CURRENT_CLIENT_ID = sql`NULLIF(current_setting('app.client_id', true), '')::uuid`;
// The signed-in Client User (withTenant's userId). Unset matches no row, so a
// tenant write that checks it is refused.
const CURRENT_USER_ID = sql`NULLIF(current_setting('app.user_id', true), '')::uuid`;

// A Client's name lives on Better Auth's `organization`, whose id this row
// shares. FORCE RLS and the grants are in the migration's custom SQL: Drizzle
// can't express them.
export const clients = pgTable(
  "clients",
  {
    // No default: it is the organization's id. No cascade: Clients are
    // archive-only.
    id: uuid("id")
      .primaryKey()
      .references(() => organization.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    pgPolicy("clients_tenant_isolation", {
      for: "all",
      using: sql`${table.id} = ${CURRENT_CLIENT_ID}`,
      withCheck: sql`${table.id} = ${CURRENT_CLIENT_ID}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Board sync: a mirror of each Client's GitHub Projects v2 boards. FORCE RLS,
// the grants and the column list on tasks_milestone_fk's SET NULL are in the
// migration's custom SQL: Drizzle can't express them.

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// Same isolation as `clients`, on the row's client_id.
function buildTenantPolicy(tableName: string, clientId: PgColumn): PgPolicy {
  return pgPolicy(`${tableName}_tenant_isolation`, {
    for: "all",
    using: sql`${clientId} = ${CURRENT_CLIENT_ID}`,
    withCheck: sql`${clientId} = ${CURRENT_CLIENT_ID}`,
  });
}

type ProjectChildColumns = { projectId: PgColumn; clientId: PgColumn };

// Pages may render these as links, so only GitHub https URLs get in: never
// a `javascript:` one.
function checkGithubUrl(tableName: string, url: PgColumn): CheckBuilder {
  return check(
    `${tableName}_url_github`,
    sql`${url} LIKE 'https://github.com/%'`,
  );
}

// Composite, so a child's client_id can never differ from its Project's.
function referenceProject(
  tableName: string,
  table: ProjectChildColumns,
): ReturnType<typeof foreignKey> {
  return foreignKey({
    name: `${tableName}_project_fk`,
    columns: [table.projectId, table.clientId],
    foreignColumns: [projects.id, projects.clientId],
  }).onDelete("cascade");
}

export const projectHealth = pgEnum("project_health", [
  "ON_TRACK",
  "AT_RISK",
  "OFF_TRACK",
  "COMPLETE",
  "INACTIVE",
]);

export const taskClientStatus = pgEnum("task_client_status", [
  "UP_NEXT",
  "IN_PROGRESS",
  "DONE",
]);

// What a sync noticed but couldn't fix. Unmapped Status options are flagged
// through their mapping rows instead.
export type SyncWarning =
  | {
      kind: "missing-field";
      field: "Client visibility" | "Client note" | "Target date";
    }
  // The field exists as an org issue field, which the sync can't read.
  | {
      kind: "issue-field";
      field: "Client visibility" | "Client note" | "Target date";
    }
  | { kind: "milestone-date-mismatch"; title: string; dueDates: string[] }
  | { kind: "unreadable-items"; count: number };

// The org's boards, cached for the Admin's link picker. Not Client-owned, so
// no client_id and no RLS; only app_system may touch it.
export const githubBoards = pgTable(
  "github_boards",
  {
    nodeId: text("node_id").primaryKey(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    closed: boolean("closed").notNull(),
    githubUpdatedAt: timestamptz("github_updated_at").notNull(),
    refreshedAt: timestamptz("refreshed_at").notNull(),
  },
  (table) => [checkGithubUrl("github_boards", table.url)],
);

// A board linked to a Client. Unlinking freezes the row (unlinked_at) instead
// of deleting it, so relinking the board to the same Client revives it.
export const projects = pgTable(
  "projects",
  {
    id: id(),
    // No cascade: Clients are archive-only.
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    githubProjectNodeId: text("github_project_node_id").notNull(),
    githubProjectNumber: integer("github_project_number").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    closedOnGithub: boolean("closed_on_github").notNull().default(false),
    unlinkedAt: timestamptz("unlinked_at"),
    lastSyncedAt: timestamptz("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    syncWarnings: jsonb("sync_warnings")
      .$type<SyncWarning[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("projects_id_client_id_key").on(table.id, table.clientId),
    unique("projects_client_id_github_project_node_id_key").on(
      table.clientId,
      table.githubProjectNodeId,
    ),
    // A board is linked to at most one Client; frozen copies don't count.
    uniqueIndex("projects_linked_board_key")
      .on(table.githubProjectNodeId)
      .where(sql`${table.unlinkedAt} is null`),
    checkGithubUrl("projects", table.url),
    buildTenantPolicy("projects", table.clientId),
  ],
);

export const statusUpdates = pgTable(
  "status_updates",
  {
    id: id(),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id").notNull(),
    githubNodeId: text("github_node_id").notNull(),
    health: projectHealth("health"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    // Markdown, raw from GitHub.
    body: text("body").notNull().default(""),
    githubCreatedAt: timestamptz("github_created_at").notNull(),
  },
  (table) => [
    referenceProject("status_updates", table),
    unique("status_updates_project_id_github_node_id_key").on(
      table.projectId,
      table.githubNodeId,
    ),
    buildTenantPolicy("status_updates", table.clientId),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    dueDate: date("due_date"),
  },
  (table) => [
    referenceProject("milestones", table),
    unique("milestones_project_id_title_key").on(table.projectId, table.title),
    unique("milestones_id_client_id_key").on(table.id, table.clientId),
    // Target of tasks_milestone_fk.
    unique("milestones_id_project_id_client_id_key").on(
      table.id,
      table.projectId,
      table.clientId,
    ),
    buildTenantPolicy("milestones", table.clientId),
  ],
);

// No client status column: it is derived at read time from status_option_id
// and the Project's status mappings (the board-sync module owns the rule).
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id").notNull(),
    milestoneId: uuid("milestone_id"),
    githubItemNodeId: text("github_item_node_id").notNull(),
    githubIssueNodeId: text("github_issue_node_id").notNull(),
    githubRepositoryNodeId: text("github_repository_node_id").notNull(),
    title: text("title").notNull(),
    clientNote: text("client_note"),
    targetDate: date("target_date"),
    // When the issue was closed.
    completedAt: timestamptz("completed_at"),
    statusOptionId: text("status_option_id"),
    hiddenAt: timestamptz("hidden_at"),
  },
  (table) => [
    referenceProject("tasks", table),
    // A Task's milestone is one of its own Project's. The migration narrows
    // this SET NULL to milestone_id: as written here it would null project_id
    // and client_id too, which are NOT NULL.
    foreignKey({
      name: "tasks_milestone_fk",
      columns: [table.milestoneId, table.projectId, table.clientId],
      foreignColumns: [
        milestones.id,
        milestones.projectId,
        milestones.clientId,
      ],
    }).onDelete("set null"),
    unique("tasks_project_id_github_item_node_id_key").on(
      table.projectId,
      table.githubItemNodeId,
    ),
    unique("tasks_id_client_id_key").on(table.id, table.clientId),
    index("tasks_github_issue_node_id_idx").on(table.githubIssueNodeId),
    index("tasks_github_repository_node_id_idx").on(
      table.githubRepositoryNodeId,
    ),
    buildTenantPolicy("tasks", table.clientId),
    // Restrictive, so it narrows the tenant policy above: Client reads never
    // see hidden Tasks. app_system bypasses RLS, so the sync and the Admin do.
    pgPolicy("tasks_tenant_visible", {
      as: "restrictive",
      for: "select",
      to: "app_tenant",
      using: sql`${table.hiddenAt} IS NULL`,
    }),
  ],
);

export const projectStatusMappings = pgTable(
  "project_status_mappings",
  {
    id: id(),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id").notNull(),
    githubOptionId: text("github_option_id").notNull(),
    optionName: text("option_name").notNull(),
    // Null means Unmapped: the Admin hasn't picked a client status yet.
    clientStatus: taskClientStatus("client_status"),
  },
  (table) => [
    referenceProject("project_status_mappings", table),
    unique("project_status_mappings_project_id_github_option_id_key").on(
      table.projectId,
      table.githubOptionId,
    ),
    buildTenantPolicy("project_status_mappings", table.clientId),
  ],
);

// ---------------------------------------------------------------------------
// Requests: Client Users submit them, the Admin triages them. The first table
// app_tenant writes. Grants (column-level), FORCE RLS, the column lists on
// the SET NULL FKs and the trigger that sets status_changed_at are in the
// migration's custom SQL: Drizzle can't express them.

const REQUEST_TITLE_MAX = 200;
const REQUEST_TEXT_MAX = 5000;

export const requestKind = pgEnum("request_kind", ["BUG", "FEATURE"]);

export const requestStatus = pgEnum("request_status", [
  "NEW",
  "ACCEPTED",
  "DECLINED",
  "DONE",
  "WITHDRAWN",
]);

export const requests = pgTable(
  "requests",
  {
    id: id(),
    // No cascade: Clients are archive-only.
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    projectId: uuid("project_id"),
    // No cascade: users are never deleted.
    submitterId: uuid("submitter_id")
      .notNull()
      .references(() => user.id),
    kind: requestKind("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: requestStatus("status").notNull().default("NEW"),
    responseNote: text("response_note"),
    taskId: uuid("task_id"),
    // The linked Task's title, kept when the Task is deleted.
    taskTitle: text("task_title"),
    // Set by a trigger whenever status changes; app_tenant can't write it.
    statusChangedAt: timestamptz("status_changed_at").notNull().defaultNow(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Composite, so the Project is the Request's Client's. The migration
    // narrows this SET NULL to project_id: as written here it would null
    // client_id too, which is NOT NULL.
    foreignKey({
      name: "requests_project_fk",
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
    }).onDelete("set null"),
    // Same for the Task, narrowed to task_id: task_title stays.
    foreignKey({
      name: "requests_task_fk",
      columns: [table.taskId, table.clientId],
      foreignColumns: [tasks.id, tasks.clientId],
    }).onDelete("set null"),
    check(
      "requests_title_length",
      sql`char_length(${table.title}) BETWEEN 1 AND ${sql.raw(String(REQUEST_TITLE_MAX))}`,
    ),
    check(
      "requests_description_length",
      sql`char_length(${table.description}) BETWEEN 1 AND ${sql.raw(String(REQUEST_TEXT_MAX))}`,
    ),
    check(
      "requests_response_note_length",
      sql`${table.responseNote} IS NULL OR char_length(${table.responseNote}) BETWEEN 1 AND ${sql.raw(String(REQUEST_TEXT_MAX))}`,
    ),
    // Only an Accepted or Done Request links a Task.
    check(
      "requests_task_link_status",
      sql`(${table.taskId} IS NULL AND ${table.taskTitle} IS NULL) OR ${table.status} IN ('ACCEPTED', 'DONE')`,
    ),
    // After the Task's deletion task_id goes null and task_title stays.
    check(
      "requests_task_title_present",
      sql`${table.taskId} IS NULL OR ${table.taskTitle} IS NOT NULL`,
    ),
    index("requests_client_id_created_at_idx").on(
      table.clientId,
      table.createdAt.desc(),
    ),
    buildTenantPolicy("requests", table.clientId),
    // Restrictive, so they narrow the tenant policy above: a Client User
    // creates New Requests as themselves, and may only change their own New
    // Request, to New or Withdrawn. app_system bypasses RLS, so the Admin
    // triages any Request.
    pgPolicy("requests_tenant_insert", {
      as: "restrictive",
      for: "insert",
      to: "app_tenant",
      withCheck: sql`${table.submitterId} = ${CURRENT_USER_ID} AND ${table.status} = 'NEW'`,
    }),
    pgPolicy("requests_tenant_update", {
      as: "restrictive",
      for: "update",
      to: "app_tenant",
      using: sql`${table.status} = 'NEW' AND ${table.submitterId} = ${CURRENT_USER_ID}`,
      withCheck: sql`${table.status} IN ('NEW', 'WITHDRAWN') AND ${table.submitterId} = ${CURRENT_USER_ID}`,
    }),
  ],
);
