import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Tx } from "@/lib/db/db";
import { requests, user } from "@/lib/db/schema";

type RequestInput = {
  clientId: string;
  // A Better Auth user id. Its `user` row is inserted if it doesn't exist yet;
  // omitted, a new user is made.
  submitterId?: string;
  projectId?: string | null;
  kind?: typeof requests.$inferInsert.kind;
  title?: string;
  description?: string;
  status?: typeof requests.$inferInsert.status;
  responseNote?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  statusChangedAt?: Date;
};

export type InsertedRequest = { id: string; submitterId: string };

// A Better Auth `user` row, the submitter a Request references. Idempotent,
// so seeds for two Clients may share one submitter.
export async function insertUser(tx: Tx, id: string): Promise<void> {
  await tx
    .insert(user)
    .values({ id, name: "Test User", email: `${id}@test.local` })
    .onConflictDoNothing({ target: user.id });
}

// As app_system: it sets the Admin-only columns too.
export async function insertRequest(
  tx: Tx,
  input: RequestInput,
): Promise<InsertedRequest> {
  const submitterId = input.submitterId ?? randomUUID();
  await insertUser(tx, submitterId);
  const [row] = await tx
    .insert(requests)
    .values({
      clientId: input.clientId,
      submitterId,
      projectId: input.projectId ?? null,
      kind: input.kind ?? "BUG",
      title: input.title ?? "Test request",
      description: input.description ?? "Steps to reproduce.",
      status: input.status ?? "NEW",
      responseNote: input.responseNote ?? null,
      taskId: input.taskId ?? null,
      taskTitle: input.taskTitle ?? null,
      statusChangedAt: input.statusChangedAt,
    })
    .returning({ id: requests.id });
  return { id: row.id, submitterId };
}

// As the owner: app_system has no DELETE on clients. Requests reference their
// submitters with no cascade, so they go first.
export async function deleteRequestsAndUsers(
  owner: pg.Client,
  input: { clientIds: string[]; userIds: string[] },
): Promise<void> {
  await owner.query("delete from requests where client_id = any($1::uuid[])", [
    input.clientIds,
  ]);
  await owner.query(`delete from "user" where id = any($1::uuid[])`, [
    input.userIds,
  ]);
}
