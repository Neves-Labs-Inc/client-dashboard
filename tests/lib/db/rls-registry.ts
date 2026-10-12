import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/db/db";
import { clients } from "@/lib/db/schema";

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
//       await tx.insert(clients).values({ id: clientId });
//       await tx.insert(invoices).values({ clientId, number: "INV-1" });
//     },
//   },
export const RLS_REGISTRY: RlsTableEntry[] = [
  {
    table: clients,
    tenantColumn: clients.id,
    seed: async (tx, clientId) => {
      await tx.insert(clients).values({ id: clientId });
    },
  },
];
