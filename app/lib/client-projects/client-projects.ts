import { and, desc, eq, isNull } from "drizzle-orm";
import {
  type ClientStatus,
  getClientStatus,
} from "@/lib/board-sync/board-sync";
import {
  getCurrentMilestone,
  getProgress,
  groupTasks,
  type Health,
  isPastProject,
  type Progress,
  sortMilestones,
  sortProjects,
  type TaskGroups,
} from "@/lib/client-projects/client-project-rules";
import type { Db, Tx } from "@/lib/db/db";
import { toPlainText } from "@/lib/markdown";
import {
  milestones,
  projects,
  projectStatusMappings,
  statusUpdates,
  tasks,
} from "@/lib/db/schema";

// The Client-facing read models. Every read runs as app_tenant and names its
// columns: the tenant grants refuse anything else (`select *` fails), and
// RLS keeps hidden Tasks and other Clients' rows out. Each read also filters
// on client_id (and Tasks on hidden_at) itself, so a policy regression
// alone can't leak them.

export type ProjectSummary = {
  id: string;
  name: string;
  isPast: boolean;
  // The latest Status Update's; null when there is none or it has none.
  health: Health | null;
  latestUpdateAt: Date | null;
  latestNote: string | null;
  currentMilestone: {
    title: string;
    dueDate: string | null;
    progress: Progress;
  } | null;
  taskCounts: Record<ClientStatus, number>;
};

export type ClientTask = {
  id: string;
  title: string;
  clientStatus: ClientStatus;
  targetDate: string | null;
  clientNote: string | null;
  completedAt: Date | null;
};

export type ClientTaskGroups = TaskGroups<ClientTask>;

export type StatusUpdateView = {
  id: string;
  health: Health | null;
  startDate: string | null;
  targetDate: string | null;
  // Raw Markdown from GitHub: render it through the Markdown module.
  body: string;
  createdAt: Date;
};

export type MilestoneView = {
  id: string;
  title: string;
  dueDate: string | null;
  progress: Progress;
  tasks: ClientTaskGroups;
};

export type ProjectView = {
  id: string;
  name: string;
  isPast: boolean;
  latest: StatusUpdateView | null;
  // Newest first.
  earlier: StatusUpdateView[];
  milestones: MilestoneView[];
  // Null when every Task has a Milestone.
  otherWork: ClientTaskGroups | null;
};

export type ClientProjects = {
  // Active first, then Past; each by name A–Z.
  listProjects(clientId: string): Promise<ProjectSummary[]>;
  // The nav count: the Client's non-Past Projects.
  countActiveProjects(clientId: string): Promise<number>;
  // Null for another Client's Project, an unknown id or a non-UUID id.
  getProject(clientId: string, projectId: string): Promise<ProjectView | null>;
};

type ClientProjectsDeps = { db: Db };

type ProjectRow = {
  id: string;
  name: string;
  closedOnGithub: boolean;
  unlinkedAt: Date | null;
};

type LatestUpdateRow = {
  projectId: string;
  health: Health | null;
  body: string;
  githubCreatedAt: Date;
};

type MappingsByProject = Map<string, Map<string, ClientStatus | null>>;

// Shape check only, as in db.ts: a non-UUID id can't name a Project, and
// Postgres would reject it as a uuid.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_MAPPINGS: Map<string, ClientStatus | null> = new Map();

const PROJECT_COLUMNS = {
  id: projects.id,
  name: projects.name,
  closedOnGithub: projects.closedOnGithub,
  unlinkedAt: projects.unlinkedAt,
};

function readProjects(tx: Tx, clientId: string): Promise<ProjectRow[]> {
  return tx
    .select(PROJECT_COLUMNS)
    .from(projects)
    .where(eq(projects.clientId, clientId));
}

// One row per Project: its Status Update with the highest github_created_at.
function readLatestUpdates(
  tx: Tx,
  clientId: string,
): Promise<LatestUpdateRow[]> {
  return tx
    .selectDistinctOn([statusUpdates.projectId], {
      projectId: statusUpdates.projectId,
      health: statusUpdates.health,
      body: statusUpdates.body,
      githubCreatedAt: statusUpdates.githubCreatedAt,
    })
    .from(statusUpdates)
    .where(eq(statusUpdates.clientId, clientId))
    .orderBy(
      statusUpdates.projectId,
      desc(statusUpdates.githubCreatedAt),
      desc(statusUpdates.id),
    );
}

// Mappings are read through the tenant grants: never option_name.
async function readMappings(
  tx: Tx,
  clientId: string,
  projectId: string | null,
): Promise<MappingsByProject> {
  const rows = await tx
    .select({
      projectId: projectStatusMappings.projectId,
      githubOptionId: projectStatusMappings.githubOptionId,
      clientStatus: projectStatusMappings.clientStatus,
    })
    .from(projectStatusMappings)
    .where(
      and(
        eq(projectStatusMappings.clientId, clientId),
        projectId === null
          ? undefined
          : eq(projectStatusMappings.projectId, projectId),
      ),
    );

  const byProject: MappingsByProject = new Map();
  for (const row of rows) {
    const mapping = byProject.get(row.projectId) ?? new Map();
    mapping.set(row.githubOptionId, row.clientStatus);
    byProject.set(row.projectId, mapping);
  }
  return byProject;
}

function isPast(project: ProjectRow, latest: LatestUpdateRow | null): boolean {
  return isPastProject({
    latestHealth: latest?.health ?? null,
    closedOnGithub: project.closedOnGithub,
    unlinkedAt: project.unlinkedAt,
  });
}

function countByStatus(statuses: ClientStatus[]): Record<ClientStatus, number> {
  const countOf = (wanted: ClientStatus) =>
    statuses.filter((status) => status === wanted).length;
  return {
    UP_NEXT: countOf("UP_NEXT"),
    IN_PROGRESS: countOf("IN_PROGRESS"),
    DONE: countOf("DONE"),
  };
}

function toStatusUpdateView(row: {
  id: string;
  health: Health | null;
  startDate: string | null;
  targetDate: string | null;
  body: string;
  githubCreatedAt: Date;
}): StatusUpdateView {
  return {
    id: row.id,
    health: row.health,
    startDate: row.startDate,
    targetDate: row.targetDate,
    body: row.body,
    createdAt: row.githubCreatedAt,
  };
}

export function createClientProjects(deps: ClientProjectsDeps): ClientProjects {
  const { db } = deps;

  async function listProjects(clientId: string): Promise<ProjectSummary[]> {
    return db.withTenant(clientId, async (tx) => {
      // Sequential: one transaction is one connection, which runs one query
      // at a time anyway (pg deprecates overlapping them).
      const projectRows = await readProjects(tx, clientId);
      const latestRows = await readLatestUpdates(tx, clientId);
      const milestoneRows = await tx
        .select({
          id: milestones.id,
          projectId: milestones.projectId,
          title: milestones.title,
          dueDate: milestones.dueDate,
        })
        .from(milestones)
        .where(eq(milestones.clientId, clientId));
      const taskRows = await tx
        .select({
          projectId: tasks.projectId,
          milestoneId: tasks.milestoneId,
          statusOptionId: tasks.statusOptionId,
        })
        .from(tasks)
        .where(and(eq(tasks.clientId, clientId), isNull(tasks.hiddenAt)));
      const mappings = await readMappings(tx, clientId, null);
      const latestByProject = new Map(
        latestRows.map((row) => [row.projectId, row]),
      );
      const statusedTasks = taskRows.map((task) => ({
        ...task,
        clientStatus: getClientStatus(
          task.statusOptionId,
          mappings.get(task.projectId) ?? NO_MAPPINGS,
        ),
      }));

      const summaries = projectRows.map((project): ProjectSummary => {
        const latest = latestByProject.get(project.id) ?? null;
        const projectTasks = statusedTasks.filter(
          (task) => task.projectId === project.id,
        );
        const current = getCurrentMilestone(
          milestoneRows
            .filter((milestone) => milestone.projectId === project.id)
            .map((milestone) => ({
              ...milestone,
              statuses: projectTasks
                .filter((task) => task.milestoneId === milestone.id)
                .map((task) => task.clientStatus),
            })),
        );
        return {
          id: project.id,
          name: project.name,
          isPast: isPast(project, latest),
          health: latest?.health ?? null,
          latestUpdateAt: latest?.githubCreatedAt ?? null,
          latestNote: latest === null ? null : toPlainText(latest.body),
          currentMilestone:
            current === null
              ? null
              : {
                  title: current.title,
                  dueDate: current.dueDate,
                  progress: getProgress(current.statuses),
                },
          taskCounts: countByStatus(
            projectTasks.map((task) => task.clientStatus),
          ),
        };
      });
      return sortProjects(summaries);
    });
  }

  async function countActiveProjects(clientId: string): Promise<number> {
    return db.withTenant(clientId, async (tx) => {
      const projectRows = await readProjects(tx, clientId);
      const latestRows = await readLatestUpdates(tx, clientId);
      const latestByProject = new Map(
        latestRows.map((row) => [row.projectId, row]),
      );
      return projectRows.filter(
        (project) => !isPast(project, latestByProject.get(project.id) ?? null),
      ).length;
    });
  }

  async function getProject(
    clientId: string,
    projectId: string,
  ): Promise<ProjectView | null> {
    if (!UUID_PATTERN.test(projectId)) return null;

    return db.withTenant(clientId, async (tx) => {
      const [project] = await tx
        .select(PROJECT_COLUMNS)
        .from(projects)
        .where(
          and(eq(projects.id, projectId), eq(projects.clientId, clientId)),
        );
      if (project === undefined) return null;

      const updateRows = await tx
        .select({
          id: statusUpdates.id,
          health: statusUpdates.health,
          startDate: statusUpdates.startDate,
          targetDate: statusUpdates.targetDate,
          body: statusUpdates.body,
          githubCreatedAt: statusUpdates.githubCreatedAt,
        })
        .from(statusUpdates)
        .where(
          and(
            eq(statusUpdates.clientId, clientId),
            eq(statusUpdates.projectId, projectId),
          ),
        )
        .orderBy(desc(statusUpdates.githubCreatedAt), desc(statusUpdates.id));
      const milestoneRows = await tx
        .select({
          id: milestones.id,
          title: milestones.title,
          dueDate: milestones.dueDate,
        })
        .from(milestones)
        .where(
          and(
            eq(milestones.clientId, clientId),
            eq(milestones.projectId, projectId),
          ),
        );
      const taskRows = await tx
        .select({
          id: tasks.id,
          milestoneId: tasks.milestoneId,
          title: tasks.title,
          statusOptionId: tasks.statusOptionId,
          targetDate: tasks.targetDate,
          clientNote: tasks.clientNote,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.clientId, clientId),
            eq(tasks.projectId, projectId),
            isNull(tasks.hiddenAt),
          ),
        );
      const mappings = await readMappings(tx, clientId, projectId);
      const mapping = mappings.get(projectId) ?? NO_MAPPINGS;
      const clientTasks = taskRows.map((task) => ({
        milestoneId: task.milestoneId,
        task: {
          id: task.id,
          title: task.title,
          clientStatus: getClientStatus(task.statusOptionId, mapping),
          targetDate: task.targetDate,
          clientNote: task.clientNote,
          completedAt: task.completedAt,
        } satisfies ClientTask,
      }));
      const tasksIn = (milestoneId: string | null) =>
        clientTasks
          .filter((entry) => entry.milestoneId === milestoneId)
          .map((entry) => entry.task);
      const [latestRow, ...earlierRows] = updateRows;
      const latest =
        latestRow === undefined ? null : toStatusUpdateView(latestRow);
      const otherWork = tasksIn(null);

      return {
        id: project.id,
        name: project.name,
        isPast: isPastProject({
          latestHealth: latest?.health ?? null,
          closedOnGithub: project.closedOnGithub,
          unlinkedAt: project.unlinkedAt,
        }),
        latest,
        earlier: earlierRows.map(toStatusUpdateView),
        milestones: sortMilestones(milestoneRows)
          .map((milestone) => ({ ...milestone, tasks: tasksIn(milestone.id) }))
          // A Milestone whose Tasks are all hidden would show only its name.
          .filter((milestone) => milestone.tasks.length > 0)
          .map((milestone) => ({
            id: milestone.id,
            title: milestone.title,
            dueDate: milestone.dueDate,
            progress: getProgress(
              milestone.tasks.map((task) => task.clientStatus),
            ),
            tasks: groupTasks(milestone.tasks),
          })),
        otherWork: otherWork.length === 0 ? null : groupTasks(otherWork),
      };
    });
  }

  return { listProjects, countActiveProjects, getProject };
}
