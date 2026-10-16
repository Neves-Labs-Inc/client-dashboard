import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, type Tx } from "@/lib/db/db";
import { clients, projects, tasks, user } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import type { RequestDraft } from "@/lib/requests/request-rules";
import { createRequests } from "@/lib/requests/requests";
import {
  insertProject,
  insertStatusMapping,
  insertStatusUpdate,
  insertTask,
} from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import {
  deleteRequestsAndUsers,
  insertRequest,
  insertUser,
} from "../../support/requests";

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const requests = createRequests({ db });
const createdClientIds: string[] = [];
const createdUserIds: string[] = [];

const DRAFT: RequestDraft = {
  kind: "BUG",
  title: "Login fails",
  description: "Steps to reproduce.",
  projectId: null,
};

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await deleteRequestsAndUsers(owner, {
      clientIds: createdClientIds,
      userIds: createdUserIds,
    });
    // Projects cascade to every other board table; clients don't cascade.
    await owner.query("delete from projects where client_id = any($1)", [
      createdClientIds,
    ]);
    await deleteClients(owner, createdClientIds);
  } finally {
    await owner.end();
    await db.close();
  }
});

// A fresh Client, seeded as app_system (the tenant role can't write most
// tables).
async function seedClient(
  seed: (tx: Tx, clientId: string) => Promise<void> = async () => {},
): Promise<string> {
  const clientId = randomUUID();
  createdClientIds.push(clientId);
  await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    await seed(tx, clientId);
  });
  return clientId;
}

// A Client User's `user` row (membership doesn't matter to this module).
async function seedUser(
  profile: { name?: string; email?: string } = {},
): Promise<string> {
  const userId = randomUUID();
  createdUserIds.push(userId);
  await db.withSystem(async (tx) => {
    await insertUser(tx, userId);
    await tx
      .update(user)
      .set({
        name: profile.name ?? "Test User",
        email: profile.email ?? `${userId}@test.local`,
      })
      .where(eq(user.id, userId));
  });
  return userId;
}

async function seedRequest(
  input: Parameters<typeof insertRequest>[1],
): Promise<string> {
  const { id, submitterId } = await db.withSystem((tx) =>
    insertRequest(tx, input),
  );
  createdUserIds.push(submitterId);
  return id;
}

async function archiveClient(clientId: string): Promise<void> {
  await db.withSystem((tx) =>
    tx
      .update(clients)
      .set({ archivedAt: new Date() })
      .where(eq(clients.id, clientId)),
  );
}

async function submit(
  actor: { clientId: string; userId: string },
  draft: Partial<RequestDraft> = {},
): Promise<string> {
  const result = await requests.submitRequest(actor, { ...DRAFT, ...draft });
  if (result.value === null) throw new Error(`submit failed: ${result.error}`);
  return result.value.id;
}

describe("submitRequest", () => {
  it("lets a Client User submit a New Request as themselves", async () => {
    const clientId = await seedClient();
    const userId = await seedUser({ name: "Maya Chen" });

    const result = await requests.submitRequest(
      { clientId, userId },
      { ...DRAFT, title: "  Login fails  " },
    );

    expect(result).toMatchObject({ error: null, status: 201, fieldErrors: {} });
    const [row] = await requests.listRequests(clientId);
    expect(row).toMatchObject({
      id: result.value?.id,
      kind: "BUG",
      title: "Login fails",
      status: "NEW",
      submitterName: "Maya Chen",
    });
  });

  it("accepts any Project of the Client, a frozen one included", async () => {
    let frozenId = "";
    const clientId = await seedClient(async (tx, id) => {
      frozenId = await insertProject(tx, {
        clientId: id,
        name: "Old site",
        unlinkedAt: new Date(),
      });
    });
    const userId = await seedUser();

    const requestId = await submit(
      { clientId, userId },
      { projectId: frozenId },
    );

    const detail = await requests.getRequest({ clientId, userId }, requestId);
    expect(detail?.project).toEqual({ id: frozenId, name: "Old site" });
  });

  it("refuses an invalid draft with field errors and writes nothing", async () => {
    let otherProjectId = "";
    await seedClient(async (tx, id) => {
      otherProjectId = await insertProject(tx, { clientId: id });
    });
    const clientId = await seedClient();
    const userId = await seedUser();

    const result = await requests.submitRequest(
      { clientId, userId },
      { kind: "BUG", title: "", description: "x", projectId: otherProjectId },
    );

    expect(result).toEqual({
      value: null,
      error: "invalid",
      status: 422,
      fieldErrors: {
        title: "Enter a title.",
        projectId: "Choose a project from the list.",
      },
    });
    expect(await requests.listRequests(clientId)).toEqual([]);
  });
});

describe("editRequest and withdrawRequest", () => {
  it("lets the submitter edit their New Request", async () => {
    const clientId = await seedClient();
    const userId = await seedUser();
    const requestId = await submit({ clientId, userId });

    const result = await requests.editRequest({ clientId, userId }, requestId, {
      ...DRAFT,
      kind: "FEATURE",
      title: "Export to CSV",
    });

    expect(result).toEqual({
      value: null,
      error: null,
      status: 200,
      fieldErrors: {},
    });
    const detail = await requests.getRequest({ clientId, userId }, requestId);
    expect(detail).toMatchObject({ kind: "FEATURE", title: "Export to CSV" });
  });

  it("refuses another Client User of the same Client as not-found", async () => {
    const clientId = await seedClient();
    const submitterId = await seedUser();
    const colleagueId = await seedUser();
    const requestId = await submit({ clientId, userId: submitterId });
    const colleague = { clientId, userId: colleagueId };

    const edit = await requests.editRequest(colleague, requestId, DRAFT);
    const withdraw = await requests.withdrawRequest(colleague, requestId);

    expect(edit).toMatchObject({ error: "not-found", status: 404 });
    expect(withdraw).toMatchObject({ error: "not-found", status: 404 });
    const detail = await requests.getRequest(colleague, requestId);
    expect(detail).toMatchObject({ status: "NEW", canChange: false });
  });

  it("refuses another Client's Request and a non-UUID id as not-found", async () => {
    const clientId = await seedClient();
    const otherClientId = await seedClient();
    const userId = await seedUser();
    const otherRequestId = await seedRequest({
      clientId: otherClientId,
      submitterId: userId,
    });
    const actor = { clientId, userId };

    expect(
      await requests.editRequest(actor, otherRequestId, DRAFT),
    ).toMatchObject({ error: "not-found" });
    expect(await requests.withdrawRequest(actor, otherRequestId)).toMatchObject(
      { error: "not-found" },
    );
    expect(await requests.withdrawRequest(actor, "nope")).toMatchObject({
      error: "not-found",
    });
  });

  it("validates an edit's draft", async () => {
    const clientId = await seedClient();
    const userId = await seedUser();
    const requestId = await submit({ clientId, userId });

    const result = await requests.editRequest({ clientId, userId }, requestId, {
      ...DRAFT,
      description: "  ",
    });

    expect(result).toMatchObject({
      error: "invalid",
      fieldErrors: { description: "Describe the bug or the feature." },
    });
  });

  it("withdraws without changing anything but the status and its time", async () => {
    const clientId = await seedClient();
    const userId = await seedUser();
    const requestId = await seedRequest({
      clientId,
      submitterId: userId,
      statusChangedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const actor = { clientId, userId };

    const result = await requests.withdrawRequest(actor, requestId);

    expect(result).toEqual({ value: null, error: null, status: 200 });
    const detail = await requests.getRequest(actor, requestId);
    expect(detail).toMatchObject({
      status: "WITHDRAWN",
      title: "Test request",
      canChange: false,
    });
    expect(detail?.statusChangedAt.getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
    expect(await requests.withdrawRequest(actor, requestId)).toMatchObject({
      error: "not-new",
      status: 409,
    });
  });

  it("refuses the submitter once triaged, and allows editing again back at New", async () => {
    const clientId = await seedClient();
    const userId = await seedUser();
    const requestId = await submit({ clientId, userId });
    const actor = { clientId, userId };
    const triage = (status: string) =>
      requests.triageRequest(requestId, {
        status,
        responseNote: "",
        taskId: null,
      });

    await triage("ACCEPTED");
    const edit = await requests.editRequest(actor, requestId, DRAFT);
    const withdraw = await requests.withdrawRequest(actor, requestId);
    const accepted = await requests.getRequest(actor, requestId);
    await triage("NEW");
    const reopened = await requests.editRequest(actor, requestId, {
      ...DRAFT,
      title: "Edited after reopening",
    });

    expect(edit).toMatchObject({ error: "not-new", status: 409 });
    expect(withdraw).toMatchObject({ error: "not-new", status: 409 });
    expect(accepted?.canChange).toBe(false);
    expect(reopened.error).toBeNull();
    expect(await requests.getRequest(actor, requestId)).toMatchObject({
      title: "Edited after reopening",
      canChange: true,
    });
  });

  it("lets only one of two racing withdrawals through", async () => {
    const clientId = await seedClient();
    const userId = await seedUser();
    const requestId = await submit({ clientId, userId });
    const actor = { clientId, userId };

    const results = await Promise.all([
      requests.withdrawRequest(actor, requestId),
      requests.withdrawRequest(actor, requestId),
    ]);

    expect(results.map((result) => result.error).sort()).toEqual([
      "not-new",
      null,
    ]);
  });
});

describe("an archived Client", () => {
  it("refuses submit, edit and withdraw as archived", async () => {
    const clientId = await seedClient();
    const userId = await seedUser();
    const actor = { clientId, userId };
    const requestId = await submit(actor);
    await archiveClient(clientId);

    const submitted = await requests.submitRequest(actor, DRAFT);
    const edited = await requests.editRequest(actor, requestId, DRAFT);
    const withdrawn = await requests.withdrawRequest(actor, requestId);

    expect(submitted).toMatchObject({ error: "archived", status: 409 });
    expect(edited).toMatchObject({ error: "archived", status: 409 });
    expect(withdrawn).toMatchObject({ error: "archived", status: 409 });
    expect(await requests.listRequests(clientId)).toHaveLength(1);
    expect((await requests.getRequest(actor, requestId))?.status).toBe("NEW");
  });
});

describe("editRequest refusal order", () => {
  const INVALID = { ...DRAFT, title: "" };

  it("gives another Client User not-found before field errors", async () => {
    const clientId = await seedClient();
    const requestId = await submit({ clientId, userId: await seedUser() });
    const colleague = { clientId, userId: await seedUser() };

    const result = await requests.editRequest(colleague, requestId, INVALID);

    expect(result).toMatchObject({ error: "not-found", fieldErrors: {} });
  });

  it("gives a stale drawer not-new before field errors", async () => {
    const clientId = await seedClient();
    const actor = { clientId, userId: await seedUser() };
    const requestId = await submit(actor);
    await requests.triageRequest(requestId, {
      status: "ACCEPTED",
      responseNote: "",
      taskId: null,
    });

    const result = await requests.editRequest(actor, requestId, INVALID);

    expect(result).toMatchObject({ error: "not-new", fieldErrors: {} });
  });

  it("refuses a draft with non-text fields as invalid", async () => {
    const clientId = await seedClient();
    const actor = { clientId, userId: await seedUser() };
    const requestId = await submit(actor);

    const result = await requests.editRequest(actor, requestId, {
      kind: "BUG",
      title: null,
      description: new File(["x"], "x.txt"),
      projectId: null,
    });

    expect(result).toMatchObject({
      error: "invalid",
      fieldErrors: {
        title: "Enter a title.",
        description: "Describe the bug or the feature.",
      },
    });
  });
});

describe("listRequests and countNewRequests", () => {
  it("lists the Client's Requests newest first, up to the limit", async () => {
    const clientId = await seedClient();
    const otherClientId = await seedClient();
    const userId = await seedUser();
    const actor = { clientId, userId };
    await submit(actor, { title: "First" });
    await submit(actor, { title: "Second" });
    await submit(actor, { title: "Third" });
    await submit({ clientId: otherClientId, userId }, { title: "Other" });

    const all = await requests.listRequests(clientId);
    const limited = await requests.listRequests(clientId, { limit: 2 });

    expect(all.map((row) => row.title)).toEqual(["Third", "Second", "First"]);
    expect(limited.map((row) => row.title)).toEqual(["Third", "Second"]);
  });

  it("clamps the limit to a positive integer", async () => {
    const clientId = await seedClient();
    await seedRequest({ clientId });
    await seedRequest({ clientId });
    await seedRequest({ clientId });

    const negative = await requests.listRequests(clientId, { limit: -1 });
    const fractional = await requests.listRequests(clientId, { limit: 2.7 });
    const notANumber = await requests.listRequests(clientId, {
      limit: Number.NaN,
    });

    expect(negative).toHaveLength(1);
    expect(fractional).toHaveLength(2);
    expect(notANumber).toHaveLength(3);
  });

  it("counts only New Requests", async () => {
    const clientId = await seedClient();
    await seedRequest({ clientId });
    await seedRequest({ clientId });
    await seedRequest({ clientId, status: "DECLINED" });
    await seedRequest({ clientId, status: "WITHDRAWN" });

    expect(await requests.countNewRequests(clientId)).toBe(2);
  });

  it("names a removed Client User, falling back to their email", async () => {
    const clientId = await seedClient();
    // No membership row: the user has left the Client, their row stays.
    const removedId = await seedUser({ name: "  ", email: "gone@acme.test" });
    await seedRequest({ clientId, submitterId: removedId });

    const [row] = await requests.listRequests(clientId);

    expect(row.submitterName).toBe("gone@acme.test");
  });
});

describe("getRequest", () => {
  it("returns null for a non-UUID, an unknown or another Client's id", async () => {
    const clientId = await seedClient();
    const otherClientId = await seedClient();
    const userId = await seedUser();
    const otherRequestId = await seedRequest({ clientId: otherClientId });
    const actor = { clientId, userId };

    expect(await requests.getRequest(actor, "not-a-uuid")).toBeNull();
    expect(await requests.getRequest(actor, randomUUID())).toBeNull();
    expect(await requests.getRequest(actor, otherRequestId)).toBeNull();
  });

  it("shows the full detail with the response note", async () => {
    const clientId = await seedClient();
    const userId = await seedUser({ name: "Maya Chen" });
    const requestId = await seedRequest({
      clientId,
      submitterId: userId,
      kind: "FEATURE",
      title: "Dark mode",
      description: "Please.",
      status: "DECLINED",
      responseNote: "Not this year.",
    });

    const detail = await requests.getRequest({ clientId, userId }, requestId);

    expect(detail).toMatchObject({
      id: requestId,
      kind: "FEATURE",
      title: "Dark mode",
      description: "Please.",
      status: "DECLINED",
      responseNote: "Not this year.",
      submitterName: "Maya Chen",
      project: null,
      task: null,
      canChange: false,
    });
  });

  it("shows a linked Task live, with its client status and Project", async () => {
    let projectId = "";
    let taskId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id, name: "Website" });
      await insertStatusMapping(tx, {
        clientId: id,
        projectId,
        githubOptionId: "opt-done",
        clientStatus: "DONE",
      });
      taskId = await insertTask(tx, {
        clientId: id,
        projectId,
        title: "Live title",
        statusOptionId: "opt-done",
      });
    });
    const requestId = await seedRequest({
      clientId,
      status: "DONE",
      taskId,
      taskTitle: "Old title",
    });

    const detail = await requests.getRequest(
      { clientId, userId: randomUUID() },
      requestId,
    );

    expect(detail?.task).toEqual({
      tracked: true,
      title: "Live title",
      clientStatus: "DONE",
      projectId,
      projectName: "Website",
    });
  });

  it("shows a hidden or deleted linked Task as no longer tracked", async () => {
    let projectId = "";
    let hiddenTaskId = "";
    let deletedTaskId = "";
    let doomedProjectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id });
      hiddenTaskId = await insertTask(tx, {
        clientId: id,
        projectId,
        title: "Hidden",
        hiddenAt: new Date(),
      });
      doomedProjectId = await insertProject(tx, { clientId: id });
      deletedTaskId = await insertTask(tx, {
        clientId: id,
        projectId: doomedProjectId,
        title: "Deleted",
      });
    });
    const hiddenRequestId = await seedRequest({
      clientId,
      status: "DONE",
      taskId: hiddenTaskId,
      taskTitle: "Hidden",
    });
    const deletedRequestId = await seedRequest({
      clientId,
      status: "ACCEPTED",
      taskId: deletedTaskId,
      taskTitle: "Deleted",
    });
    // Deleting the Project deletes its Tasks; task_id goes null.
    await db.withSystem((tx) =>
      tx.delete(projects).where(eq(projects.id, doomedProjectId)),
    );

    const actor = { clientId, userId: randomUUID() };
    const hidden = await requests.getRequest(actor, hiddenRequestId);
    const deleted = await requests.getRequest(actor, deletedRequestId);

    expect(hidden?.task).toEqual({ tracked: false, title: "Hidden" });
    expect(deleted?.task).toEqual({ tracked: false, title: "Deleted" });
    expect(await requests.getAdminRequest(hiddenRequestId)).toMatchObject({
      taskId: hiddenTaskId,
      taskTitle: "Hidden",
      taskTracked: false,
    });
    expect(await requests.getAdminRequest(deletedRequestId)).toMatchObject({
      taskId: null,
      taskTitle: "Deleted",
      taskTracked: false,
    });
  });
});

describe("listProjectOptions", () => {
  it("lists active Projects A–Z, then Past ones A–Z", async () => {
    const clientId = await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id, name: "zeta" });
      await insertProject(tx, { clientId: id, name: "Alpha" });
      await insertProject(tx, {
        clientId: id,
        name: "Closed",
        closedOnGithub: true,
      });
      const completeId = await insertProject(tx, {
        clientId: id,
        name: "Beta",
      });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId: completeId,
        health: "COMPLETE",
      });
    });

    const options = await requests.listProjectOptions(clientId);

    expect(options.map(({ name, isPast }) => [name, isPast])).toEqual([
      ["Alpha", false],
      ["zeta", false],
      ["Beta", true],
      ["Closed", true],
    ]);
  });
});

describe("triageRequest", () => {
  async function seedLinkable(): Promise<{
    clientId: string;
    projectId: string;
    taskId: string;
  }> {
    let projectId = "";
    let taskId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id });
      taskId = await insertTask(tx, {
        clientId: id,
        projectId,
        title: "Fix login",
      });
    });
    return { clientId, projectId, taskId };
  }

  it("links a Task and snapshots its title on New to Done", async () => {
    const { clientId, taskId } = await seedLinkable();
    const requestId = await seedRequest({ clientId });

    const result = await requests.triageRequest(requestId, {
      status: "DONE",
      responseNote: "  Shipped in 2.1. ",
      taskId,
    });

    expect(result).toEqual({ value: null, error: null, status: 200 });
    expect(await requests.getAdminRequest(requestId)).toMatchObject({
      status: "DONE",
      responseNote: "Shipped in 2.1.",
      taskId,
      taskTitle: "Fix login",
      taskTracked: true,
    });
  });

  it("clears the link and the snapshot on Done to Declined", async () => {
    const { clientId, taskId } = await seedLinkable();
    const requestId = await seedRequest({ clientId });
    await requests.triageRequest(requestId, {
      status: "DONE",
      responseNote: "",
      taskId,
    });

    await requests.triageRequest(requestId, {
      status: "DECLINED",
      responseNote: "",
      taskId,
    });

    const detail = await requests.getAdminRequest(requestId);
    expect(detail).toMatchObject({ taskId: null, taskTitle: null });
    const clientView = await requests.getRequest(
      { clientId, userId: randomUUID() },
      requestId,
    );
    expect(clientView?.task).toBeNull();
  });

  it("refreshes the title snapshot on every save while linked", async () => {
    const { clientId, taskId } = await seedLinkable();
    const requestId = await seedRequest({ clientId });
    const save = () =>
      requests.triageRequest(requestId, {
        status: "ACCEPTED",
        responseNote: "",
        taskId,
      });
    await save();
    await db.withSystem((tx) =>
      tx
        .update(tasks)
        .set({ title: "Fix login on Safari" })
        .where(eq(tasks.id, taskId)),
    );
    // Hide it, so the Client sees only the snapshot.
    await db.withSystem((tx) =>
      tx
        .update(tasks)
        .set({ hiddenAt: new Date() })
        .where(eq(tasks.id, taskId)),
    );

    await save();

    const clientView = await requests.getRequest(
      { clientId, userId: randomUUID() },
      requestId,
    );
    expect(clientView?.task).toEqual({
      tracked: false,
      title: "Fix login on Safari",
    });
  });

  it("moves status_changed_at only when the status changes", async () => {
    const { clientId } = await seedLinkable();
    const before = new Date("2026-01-01T00:00:00Z");
    const requestId = await seedRequest({ clientId, statusChangedAt: before });

    await requests.triageRequest(requestId, {
      status: "NEW",
      responseNote: "Looking into it.",
      taskId: null,
    });
    const unchanged = await requests.getAdminRequest(requestId);
    await requests.triageRequest(requestId, {
      status: "ACCEPTED",
      responseNote: "Looking into it.",
      taskId: null,
    });
    const changed = await requests.getAdminRequest(requestId);

    expect(unchanged?.statusChangedAt).toEqual(before);
    expect(unchanged?.responseNote).toBe("Looking into it.");
    expect(changed?.statusChangedAt.getTime()).toBeGreaterThan(
      before.getTime(),
    );
  });

  it("allows any move among New, Accepted, Declined and Done", async () => {
    const { clientId } = await seedLinkable();
    const requestId = await seedRequest({ clientId });

    for (const status of ["DONE", "DECLINED", "ACCEPTED", "NEW", "DONE"]) {
      const result = await requests.triageRequest(requestId, {
        status,
        responseNote: "",
        taskId: null,
      });
      expect(result.error).toBeNull();
    }
    expect((await requests.getAdminRequest(requestId))?.status).toBe("DONE");
  });

  it("refuses a Withdrawn Request", async () => {
    const { clientId } = await seedLinkable();
    const requestId = await seedRequest({ clientId, status: "WITHDRAWN" });

    const result = await requests.triageRequest(requestId, {
      status: "ACCEPTED",
      responseNote: "",
      taskId: null,
    });

    expect(result).toMatchObject({ error: "withdrawn", status: 409 });
    expect((await requests.getAdminRequest(requestId))?.status).toBe(
      "WITHDRAWN",
    );
  });

  it("refuses an archived Client's Request", async () => {
    const { clientId, taskId } = await seedLinkable();
    const requestId = await seedRequest({ clientId });
    await archiveClient(clientId);

    const plain = await requests.triageRequest(requestId, {
      status: "ACCEPTED",
      responseNote: "",
      taskId: null,
    });
    const linking = await requests.triageRequest(requestId, {
      status: "ACCEPTED",
      responseNote: "",
      taskId,
    });

    expect(plain).toMatchObject({ error: "archived", status: 409 });
    expect(linking).toMatchObject({ error: "archived" });
    expect(await requests.getAdminRequest(requestId)).toMatchObject({
      status: "NEW",
      clientArchived: true,
    });
  });

  it("refuses another Client's Task or a non-UUID Task id", async () => {
    const { clientId } = await seedLinkable();
    const other = await seedLinkable();
    const requestId = await seedRequest({ clientId });

    const foreign = await requests.triageRequest(requestId, {
      status: "DONE",
      responseNote: "",
      taskId: other.taskId,
    });
    const malformed = await requests.triageRequest(requestId, {
      status: "DONE",
      responseNote: "",
      taskId: "task-1",
    });

    expect(foreign).toMatchObject({ error: "task-not-found", status: 422 });
    expect(malformed).toMatchObject({ error: "task-not-found" });
    expect((await requests.getAdminRequest(requestId))?.status).toBe("NEW");
  });

  it("links a hidden Task and one of a frozen Project", async () => {
    let hiddenTaskId = "";
    let frozenTaskId = "";
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      hiddenTaskId = await insertTask(tx, {
        clientId: id,
        projectId,
        hiddenAt: new Date(),
      });
      const frozenId = await insertProject(tx, {
        clientId: id,
        unlinkedAt: new Date(),
      });
      frozenTaskId = await insertTask(tx, {
        clientId: id,
        projectId: frozenId,
      });
    });
    const requestId = await seedRequest({ clientId });

    for (const taskId of [hiddenTaskId, frozenTaskId]) {
      const result = await requests.triageRequest(requestId, {
        status: "DONE",
        responseNote: "",
        taskId,
      });
      expect(result.error).toBeNull();
    }
  });

  it("refuses an unknown or non-UUID Request as not-found", async () => {
    const input = { status: "DONE", responseNote: "", taskId: null };

    expect(await requests.triageRequest(randomUUID(), input)).toMatchObject({
      error: "not-found",
      status: 404,
    });
    expect(await requests.triageRequest("nope", input)).toMatchObject({
      error: "not-found",
    });
  });

  it("refuses Withdrawn as a status and a note over 5,000 characters", async () => {
    const { clientId } = await seedLinkable();
    const requestId = await seedRequest({ clientId });

    expect(
      await requests.triageRequest(requestId, {
        status: "WITHDRAWN",
        responseNote: "",
        taskId: null,
      }),
    ).toMatchObject({ error: "invalid", status: 422 });
    expect(
      await requests.triageRequest(requestId, {
        status: "DONE",
        responseNote: "a".repeat(5001),
        taskId: null,
      }),
    ).toMatchObject({ error: "invalid" });
  });
});

describe("Admin lists and counts", () => {
  it("lists the inbox across active Clients, New only or all, newest first", async () => {
    const activeId = await seedClient();
    const archivedId = await seedClient();
    const submitterId = await seedUser({ name: "Maya Chen" });
    const first = await seedRequest({ clientId: activeId, submitterId });
    const declined = await seedRequest({
      clientId: activeId,
      submitterId,
      status: "DECLINED",
    });
    const last = await seedRequest({ clientId: activeId, submitterId });
    await seedRequest({ clientId: archivedId });
    await archiveClient(archivedId);
    const ours = <T extends { clientId: string }>(rows: T[]): T[] =>
      rows.filter((row) => [activeId, archivedId].includes(row.clientId));

    const newOnly = ours(await requests.listInbox("new"));
    const all = ours(await requests.listInbox("all"));

    expect(newOnly.map((row) => row.id)).toEqual([last, first]);
    expect(all.map((row) => row.id)).toEqual([last, declined, first]);
    expect(newOnly[0]).toMatchObject({
      clientId: activeId,
      clientName: `Test Client ${activeId}`,
      submitterName: "Maya Chen",
      status: "NEW",
    });
  });

  it("lists one Client's Requests, an archived Client's included", async () => {
    const clientId = await seedClient();
    const otherId = await seedClient();
    const older = await seedRequest({ clientId });
    const newer = await seedRequest({ clientId, status: "WITHDRAWN" });
    await seedRequest({ clientId: otherId });
    await archiveClient(clientId);

    const rows = await requests.listClientRequests(clientId);

    expect(rows.map((row) => row.id)).toEqual([newer, older]);
    expect(rows[0]).not.toHaveProperty("clientId");
  });

  it("counts New Requests per active Client, leaving out zero counts", async () => {
    const twoNew = await seedClient();
    const noneNew = await seedClient();
    const archived = await seedClient();
    await seedRequest({ clientId: twoNew });
    await seedRequest({ clientId: twoNew });
    await seedRequest({ clientId: twoNew, status: "DONE" });
    await seedRequest({ clientId: noneNew, status: "ACCEPTED" });
    await seedRequest({ clientId: archived });
    await archiveClient(archived);

    const counts = await requests.countNewByClient();

    expect(counts[twoNew]).toBe(2);
    expect(counts).not.toHaveProperty(noneNew);
    expect(counts).not.toHaveProperty(archived);
  });
});

describe("getAdminRequest", () => {
  it("shows the detail with the Client and the submitter's email", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id, name: "Website" });
    });
    const submitterId = await seedUser({
      name: "Maya Chen",
      email: "maya@acme.test",
    });
    const requestId = await seedRequest({
      clientId,
      submitterId,
      projectId,
      title: "Login fails",
    });

    const detail = await requests.getAdminRequest(requestId, clientId);

    expect(detail).toMatchObject({
      id: requestId,
      title: "Login fails",
      clientId,
      clientName: `Test Client ${clientId}`,
      clientArchived: false,
      submitterName: "Maya Chen",
      submitterEmail: "maya@acme.test",
      project: { id: projectId, name: "Website" },
      taskId: null,
      taskTitle: null,
      taskTracked: false,
    });
    expect(detail).not.toHaveProperty("canChange");
  });

  it("returns null for a non-UUID, an unknown or another Client's id", async () => {
    const clientId = await seedClient();
    const otherId = await seedClient();
    const otherRequestId = await seedRequest({ clientId: otherId });

    expect(await requests.getAdminRequest("nope")).toBeNull();
    expect(await requests.getAdminRequest(randomUUID())).toBeNull();
    expect(await requests.getAdminRequest(otherRequestId, clientId)).toBeNull();
    expect(await requests.getAdminRequest(otherRequestId, "nope")).toBeNull();
  });
});

describe("listTaskOptions", () => {
  it("groups every Task of the Client, the Request's Project first", async () => {
    let requestProjectId = "";
    let visibleId = "";
    let hiddenId = "";
    let frozenTaskId = "";
    let frozenProjectId = "";
    const clientId = await seedClient(async (tx, id) => {
      const alphaId = await insertProject(tx, { clientId: id, name: "Alpha" });
      await insertTask(tx, { clientId: id, projectId: alphaId, title: "A1" });
      requestProjectId = await insertProject(tx, {
        clientId: id,
        name: "Zulu",
      });
      visibleId = await insertTask(tx, {
        clientId: id,
        projectId: requestProjectId,
        title: "Visible",
      });
      hiddenId = await insertTask(tx, {
        clientId: id,
        projectId: requestProjectId,
        title: "Hidden",
        hiddenAt: new Date(),
      });
      frozenProjectId = await insertProject(tx, {
        clientId: id,
        name: "Beta",
        unlinkedAt: new Date(),
      });
      frozenTaskId = await insertTask(tx, {
        clientId: id,
        projectId: frozenProjectId,
        title: "Old",
      });
      await insertProject(tx, { clientId: id, name: "Empty" });
    });
    await seedLinkableElsewhere();

    const groups = await requests.listTaskOptions(clientId, requestProjectId);

    expect(groups.map((group) => group.label)).toEqual([
      "Zulu",
      "Alpha",
      "Beta (unlinked)",
    ]);
    expect(groups[0].options).toEqual([
      { id: hiddenId, label: "Hidden (hidden)" },
      { id: visibleId, label: "Visible" },
    ]);
    expect(groups[2]).toEqual({
      projectId: frozenProjectId,
      label: "Beta (unlinked)",
      options: [{ id: frozenTaskId, label: "Old" }],
    });
  });
});

// Another Client's board, so a leak across Clients would show.
async function seedLinkableElsewhere(): Promise<void> {
  await seedClient(async (tx, id) => {
    const projectId = await insertProject(tx, { clientId: id, name: "Aaa" });
    await insertTask(tx, { clientId: id, projectId, title: "Not yours" });
  });
}
