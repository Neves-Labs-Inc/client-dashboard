import { and, eq, sql } from "drizzle-orm";
import type { ClientActor } from "@/lib/auth/invitations";
import type { Db, Tx } from "@/lib/db/db";
import { clients, invitation, member, session } from "@/lib/db/schema";
import type { Result } from "@/lib/result";

// Who is on a Client's team and as what: role changes, removals and leaving,
// under the last-Owner rule. Each runs in one transaction that locks the
// Client's row first, the order joins and Invitations take it in (joins lock
// the joiner's user row before it; nothing here locks a user row), so two
// racing demotions run one after the other and the second sees the first.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OK = 200;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;

// not-found: no such member of that Client (or a malformed id). forbidden:
// a Member, or an Owner of another Client (or no longer an Owner). self: an
// Owner acting on their own row (leaving is leaveClient). archived: the
// Client is archived, and this isn't the Admin removing someone.
export type RosterError =
  "not-found" | "forbidden" | "self" | "last-owner" | "archived" | "no-change";

export type Role = "owner" | "member";

// The Admin, or a Client User (a ClientAccess fits).
export type RosterActor =
  { kind: "admin" } | ({ kind: "client" } & ClientActor);

const ERROR_STATUS: Record<RosterError, number> = {
  "not-found": NOT_FOUND,
  forbidden: FORBIDDEN,
  self: UNPROCESSABLE,
  "last-owner": CONFLICT,
  archived: FORBIDDEN,
  "no-change": CONFLICT,
};

type Operation = "change a role" | "remove a member" | "leave a Client";

type Change =
  { kind: "role"; role: Role } | { kind: "remove" } | { kind: "leave" };

type Target = { actor: RosterActor; clientId: string; userId: string };

export class Roster {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  // Role changes revoke nothing: access is read per request.
  changeRole(
    actor: RosterActor,
    clientId: string,
    userId: string,
    role: Role,
  ): Promise<Result<null, RosterError>> {
    return this.#run({ actor, clientId, userId }, { kind: "role", role });
  }

  // The member row and every session of that user go; the user row stays.
  removeMember(
    actor: RosterActor,
    clientId: string,
    userId: string,
  ): Promise<Result<null, RosterError>> {
    return this.#run({ actor, clientId, userId }, { kind: "remove" });
  }

  // As removeMember, for the actor's own row.
  leave(actor: ClientActor): Promise<Result<null, RosterError>> {
    const self: RosterActor = { kind: "client", ...actor };
    return this.#run(
      { actor: self, clientId: actor.clientId, userId: actor.userId },
      { kind: "leave" },
    );
  }

  async #run(
    target: Target,
    change: Change,
  ): Promise<Result<null, RosterError>> {
    const operation = OPERATION[change.kind];
    const refusal = getRequestRefusal(target, change);
    if (refusal !== null) return refuse(operation, refusal, target);

    const outcome = await this.#db.withSystem((tx) =>
      applyChange(tx, target, change),
    );
    if (outcome !== null) return refuse(operation, outcome, target);

    return { value: null, error: null, status: OK };
  }
}

const OPERATION: Record<Change["kind"], Operation> = {
  role: "change a role",
  remove: "remove a member",
  leave: "leave a Client",
};

// What can be refused before reading anything.
function getRequestRefusal(
  { actor, clientId, userId }: Target,
  change: Change,
): RosterError | null {
  let refusal: RosterError | null = null;
  const isClientActor = actor.kind === "client" && change.kind !== "leave";
  if (
    isClientActor &&
    (actor.role !== "owner" || actor.clientId !== clientId)
  ) {
    refusal = "forbidden";
  } else if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(userId)) {
    refusal = "not-found";
  } else if (isClientActor && actor.userId === userId) {
    refusal = "self";
  }
  return refusal;
}

// The change under the Client's row lock, every rule re-checked; null once
// it's written.
async function applyChange(
  tx: Tx,
  { actor, clientId, userId }: Target,
  change: Change,
): Promise<RosterError | null> {
  const [client] = await tx
    .select({ archivedAt: clients.archivedAt })
    .from(clients)
    .where(eq(clients.id, clientId))
    .for("update");
  if (!client) return "not-found";
  // v1 spec: the Admin may still remove users of an archived Client.
  const isAdminRemove = actor.kind === "admin" && change.kind === "remove";
  if (client.archivedAt !== null && !isAdminRemove) return "archived";
  const isOwnerActing = actor.kind === "client" && change.kind !== "leave";
  if (
    isOwnerActing &&
    (await findRole(tx, clientId, actor.userId)) !== "owner"
  ) {
    return "forbidden";
  }

  const role = await findRole(tx, clientId, userId);
  if (role === null) return "not-found";
  if (change.kind === "role" && change.role === role) return "no-change";
  const isLosingOwner =
    role === "owner" && !(change.kind === "role" && change.role === "owner");
  if (isLosingOwner && (await isLastOwnerRefused(tx, clientId, change))) {
    return "last-owner";
  }

  const isTarget = and(
    eq(member.organizationId, clientId),
    eq(member.userId, userId),
  );
  if (change.kind === "role") {
    await tx.update(member).set({ role: change.role }).where(isTarget);
  } else {
    await tx.delete(member).where(isTarget);
    await tx.delete(session).where(eq(session.userId, userId));
    await cancelInvitationsIfEmpty(tx, clientId);
  }
  return null;
}

// An empty Client keeps no live Invitation: nobody joins it without an
// Owner, and the Admin's "Invite first Owner" comes back. Under the Client's
// lock, the order Invitations take (clients, then invitation).
async function cancelInvitationsIfEmpty(
  tx: Tx,
  clientId: string,
): Promise<void> {
  const [remaining] = await tx
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, clientId))
    .limit(1);
  if (remaining) return;

  await tx
    .update(invitation)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitation.organizationId, clientId),
        eq(invitation.status, "pending"),
      ),
    );
}

// The member's role in the Client, locked; null when they aren't one.
async function findRole(
  tx: Tx,
  clientId: string,
  userId: string,
): Promise<Role | null> {
  const [row] = await tx
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, clientId), eq(member.userId, userId)))
    .for("update");
  if (!row) return null;

  return row.role === "owner" ? "owner" : "member";
}

// An Owner is about to stop being one. Refused when they are the last
// Owner, unless they leave the Client (or the Admin removes them) as its
// only user: the Client is then empty, and the Admin invites a first Owner
// again. A last Owner is never demoted: the Client would keep users and no
// Owner.
async function isLastOwnerRefused(
  tx: Tx,
  clientId: string,
  change: Change,
): Promise<boolean> {
  const [counts] = await tx
    .select({
      owners: sql<number>`count(*) filter (where ${member.role} = 'owner')::int`,
      users: sql<number>`count(*)::int`,
    })
    .from(member)
    .where(eq(member.organizationId, clientId));
  if (counts.owners > 1) return false;

  return change.kind === "role" || counts.users > 1;
}

// Ids only: the log never names who was acted on.
function refuse(
  operation: Operation,
  error: RosterError,
  { clientId }: Target,
): Result<null, RosterError> {
  const isUuid = UUID_PATTERN.test(clientId);
  console.warn(`auth: refused to ${operation} (${error})`, {
    clientId: isUuid ? clientId : null,
  });
  return { value: null, error, status: ERROR_STATUS[error] };
}
