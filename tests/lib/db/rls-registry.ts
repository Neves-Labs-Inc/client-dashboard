import { randomUUID } from "node:crypto";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/db/db";
import {
  clients,
  milestones,
  projects,
  projectStatusMappings,
  requests,
  statusUpdates,
  tasks,
} from "@/lib/db/schema";
import {
  insertMilestone,
  insertProject,
  insertStatusMapping,
  insertStatusUpdate,
  insertTask,
} from "../../support/board";
import { insertClients } from "../../support/clients";
import { insertRequest } from "../../support/requests";

export type RlsTableEntry = {
  table: PgTable;
  // The column the policy compares with app.client_id.
  tenantColumn: PgColumn;
  // The columns app_tenant may SELECT. Every other column of the table must be
  // refused to it, so a column added later stays hidden until listed here.
  tenantReadable: PgColumn[];
  // Inserts one row (plus any parents it needs) owned by clientId, inside
  // withSystem. It returns nothing: the harness finds the row by tenantColumn.
  seed: (tx: Tx, clientId: string) => Promise<void>;
  // For a table whose write policies check app.user_id: the user the seeded
  // rows belong to. The harness sets it for tenant writes, so only the
  // app.client_id check can refuse them, and deletes its `user` row after.
  tenantUserId?: string;
};

// Submits the seeded Requests of both Clients.
const REQUEST_SUBMITTER_ID = randomUUID();

// Every Client-owned table, parents before children: the harness checks each
// one and cleans up in reverse order. A new table needs one entry here and
// nothing else, e.g.:
//
//   {
//     table: invoices,
//     tenantColumn: invoices.clientId,
//     tenantReadable: [invoices.id, invoices.clientId, invoices.number],
//     seed: async (tx, clientId) => {
//       await insertClients(tx, [clientId]);
//       await tx.insert(invoices).values({ clientId, number: "INV-1" });
//     },
//   },
//
// Seeds may insert a Client's `organization` row (it has no RLS); the harness
// deletes those after every registered table, then the tenantUserId users.
export const RLS_REGISTRY: RlsTableEntry[] = [
  {
    table: clients,
    tenantColumn: clients.id,
    tenantReadable: [clients.id, clients.archivedAt, clients.createdAt],
    // clients.id references organization.id, so the organization goes first.
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
    },
  },
  {
    table: projects,
    tenantColumn: projects.clientId,
    tenantReadable: [
      projects.id,
      projects.clientId,
      projects.name,
      projects.closedOnGithub,
      projects.unlinkedAt,
      projects.createdAt,
    ],
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      await insertProject(tx, { clientId });
    },
  },
  {
    table: statusUpdates,
    tenantColumn: statusUpdates.clientId,
    tenantReadable: [
      statusUpdates.id,
      statusUpdates.clientId,
      statusUpdates.projectId,
      statusUpdates.health,
      statusUpdates.startDate,
      statusUpdates.targetDate,
      statusUpdates.body,
      statusUpdates.githubCreatedAt,
    ],
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertStatusUpdate(tx, { clientId, projectId });
    },
  },
  {
    table: milestones,
    tenantColumn: milestones.clientId,
    tenantReadable: [
      milestones.id,
      milestones.clientId,
      milestones.projectId,
      milestones.title,
      milestones.dueDate,
    ],
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertMilestone(tx, { clientId, projectId });
    },
  },
  {
    table: tasks,
    tenantColumn: tasks.clientId,
    tenantReadable: [
      tasks.id,
      tasks.clientId,
      tasks.projectId,
      tasks.milestoneId,
      tasks.title,
      tasks.clientNote,
      tasks.targetDate,
      tasks.completedAt,
      tasks.statusOptionId,
      tasks.hiddenAt,
    ],
    // With a milestone, so the (milestone_id, project_id, client_id) FK is in play too.
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      const milestoneId = await insertMilestone(tx, { clientId, projectId });
      await insertTask(tx, { clientId, projectId, milestoneId });
    },
  },
  {
    table: projectStatusMappings,
    tenantColumn: projectStatusMappings.clientId,
    tenantReadable: [
      projectStatusMappings.id,
      projectStatusMappings.clientId,
      projectStatusMappings.projectId,
      projectStatusMappings.githubOptionId,
      projectStatusMappings.clientStatus,
    ],
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertStatusMapping(tx, { clientId, projectId });
    },
  },
  {
    table: requests,
    tenantColumn: requests.clientId,
    tenantReadable: [
      requests.id,
      requests.clientId,
      requests.projectId,
      requests.submitterId,
      requests.kind,
      requests.title,
      requests.description,
      requests.status,
      requests.responseNote,
      requests.taskId,
      requests.taskTitle,
      requests.statusChangedAt,
      requests.createdAt,
    ],
    tenantUserId: REQUEST_SUBMITTER_ID,
    // With a Project, so the (project_id, client_id) FK is in play too. NEW,
    // so the submitter's tenant write policies let the row be changed.
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertRequest(tx, {
        clientId,
        projectId,
        submitterId: REQUEST_SUBMITTER_ID,
      });
    },
  },
];
