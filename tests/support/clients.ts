import type pg from "pg";
import type { Tx } from "@/lib/db/db";
import { clients, organization } from "@/lib/db/schema";

// A Client is an `organization` row plus a `clients` row with the same id
// (clients.id references organization.id), so tests insert both.
export async function insertClients(tx: Tx, ids: string[]): Promise<void> {
  await tx.insert(organization).values(
    ids.map((id) => ({
      id,
      name: `Test Client ${id}`,
      slug: id,
      createdAt: new Date(),
    })),
  );
  await tx.insert(clients).values(ids.map((id) => ({ id })));
}

// As the owner: app_system can't DELETE from clients. Children before parents.
export async function deleteClients(
  owner: pg.Client,
  ids: string[],
): Promise<void> {
  await owner.query("delete from clients where id = any($1::uuid[])", [ids]);
  await owner.query("delete from organization where id = any($1::uuid[])", [
    ids,
  ]);
}
