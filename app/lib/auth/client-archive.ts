import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/db";
import {
  clients,
  invitation,
  member,
  organization,
  session,
} from "@/lib/db/schema";
import type { Result } from "@/lib/result";

// Archiving locks a Client out of the portal without deleting anything: its
// members are signed out, its live Invitations canceled, and sign-in refuses
// them while it lasts (getStanding reads archived_at). Each change runs in
// one transaction that locks the Client's row first, the order joins,
// Invitations and the Roster take (clients, then invitation or member).

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OK = 200;
const NOT_FOUND = 404;

export type ArchiveError = "not-found";

export type ArchivedClient = { id: string; name: string; archivedAt: Date };

type Operation = "archive" | "unarchive";

export class ClientArchive {
  readonly #db: Db;
  readonly #now: () => Date;

  constructor(db: Db, now: () => Date) {
    this.#db = db;
    this.#now = now;
  }

  // Already archived is a success that keeps the first date. The sign-out
  // and the cancels run again anyway: they find nothing, or a session a
  // racing sign-in slipped in.
  async archive(clientId: string): Promise<Result<null, ArchiveError>> {
    if (!UUID_PATTERN.test(clientId)) return refuse("archive", null);

    const now = this.#now();
    const isFound = await this.#db.withSystem(async (tx) => {
      const client = await lockClient(tx, clientId);
      if (!client) return false;

      if (client.archivedAt === null) {
        await tx
          .update(clients)
          .set({ archivedAt: now })
          .where(eq(clients.id, clientId));
      }
      await cancelLiveInvitations(tx, clientId, now);
      await deleteMemberSessions(tx, clientId);
      return true;
    });
    if (!isFound) return refuse("archive", clientId);

    return { value: null, error: null, status: OK };
  }

  // Members may sign in again; the canceled Invitations stay canceled.
  async unarchive(clientId: string): Promise<Result<null, ArchiveError>> {
    if (!UUID_PATTERN.test(clientId)) return refuse("unarchive", null);

    const isFound = await this.#db.withSystem(async (tx) => {
      const client = await lockClient(tx, clientId);
      if (!client) return false;

      if (client.archivedAt !== null) {
        await tx
          .update(clients)
          .set({ archivedAt: null })
          .where(eq(clients.id, clientId));
      }
      return true;
    });
    if (!isFound) return refuse("unarchive", clientId);

    return { value: null, error: null, status: OK };
  }

  // By name, case-insensitively.
  list(): Promise<ArchivedClient[]> {
    return this.#db.withSystem(async (tx) => {
      const rows = await tx
        .select({
          id: clients.id,
          name: organization.name,
          archivedAt: clients.archivedAt,
        })
        .from(clients)
        .innerJoin(organization, eq(organization.id, clients.id))
        .where(isNotNull(clients.archivedAt))
        .orderBy(asc(sql`lower(${organization.name})`), asc(clients.id));
      return rows.flatMap(({ archivedAt, ...row }) =>
        archivedAt === null ? [] : [{ ...row, archivedAt }],
      );
    });
  }
}

async function lockClient(
  tx: Tx,
  clientId: string,
): Promise<{ archivedAt: Date | null } | null> {
  const [client] = await tx
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, clientId))
    .for("update");
  return client ?? null;
}

async function cancelLiveInvitations(
  tx: Tx,
  clientId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(invitation)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitation.organizationId, clientId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    );
}

// Every session of its members, whatever the sign-in method: access is read
// per request too, but a session row would outlive an unarchive.
async function deleteMemberSessions(tx: Tx, clientId: string): Promise<void> {
  const members = tx
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, clientId));
  await tx.delete(session).where(inArray(session.userId, members));
}

// Ids only, once known to be UUIDs: the log never echoes arbitrary input.
function refuse(
  operation: Operation,
  clientId: string | null,
): Result<null, ArchiveError> {
  console.warn(`auth: refused to ${operation} a Client (not-found)`, {
    clientId,
  });
  return { value: null, error: "not-found", status: NOT_FOUND };
}
