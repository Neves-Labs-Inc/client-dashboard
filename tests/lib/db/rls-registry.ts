import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/db/db";
import {
  clients,
  milestones,
  projects,
  projectStatusMappings,
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

export type RlsTableEntry = {
  table: PgTable;
  // The column the policy compares with app.client_id.
  tenantColumn: PgColumn;
  // Inserts one row (plus any parents it needs) owned by clientId, inside
  // withSystem. It returns nothing: the harness finds the row by tenantColumn.
  seed: (tx: Tx, clientId: string) => Promise<void>;
};

// Every Client-owned table, parents before children: the harness checks each
// one and cleans up in reverse order. A new table needs one entry here and
// nothing else, e.g.:
//
//   {
//     table: invoices,
//     tenantColumn: invoices.clientId,
//     seed: async (tx, clientId) => {
//       await insertClients(tx, [clientId]);
//       await tx.insert(invoices).values({ clientId, number: "INV-1" });
//     },
//   },
//
// Seeds may insert a Client's `organization` row (it has no RLS); the harness
// deletes those after every registered table.
export const RLS_REGISTRY: RlsTableEntry[] = [
  {
    table: clients,
    tenantColumn: clients.id,
    // clients.id references organization.id, so the organization goes first.
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
    },
  },
  {
    table: projects,
    tenantColumn: projects.clientId,
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      await insertProject(tx, { clientId });
    },
  },
  {
    table: statusUpdates,
    tenantColumn: statusUpdates.clientId,
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertStatusUpdate(tx, { clientId, projectId });
    },
  },
  {
    table: milestones,
    tenantColumn: milestones.clientId,
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertMilestone(tx, { clientId, projectId });
    },
  },
  {
    table: tasks,
    tenantColumn: tasks.clientId,
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
    seed: async (tx, clientId) => {
      await insertClients(tx, [clientId]);
      const projectId = await insertProject(tx, { clientId });
      await insertStatusMapping(tx, { clientId, projectId });
    },
  },
];
