import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "@/lib/db/db";
import { projects, requests, tasks } from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { insertProject, insertTask } from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import { getPgError } from "../../support/pg-error";
import {
  deleteRequestsAndUsers,
  insertRequest,
  insertUser,
} from "../../support/requests";

const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const TITLE_MAX = 200;
const TEXT_MAX = 5000;

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const clientA = randomUUID();
const clientB = randomUUID();
const submitterId = randomUUID();
let projectA = "";
let projectB = "";
let taskA = "";
let taskB = "";

beforeAll(async () => {
  await db.withSystem(async (tx) => {
    await insertClients(tx, [clientA, clientB]);
    await insertUser(tx, submitterId);
    projectA = await insertProject(tx, { clientId: clientA });
    projectB = await insertProject(tx, { clientId: clientB });
    taskA = await insertTask(tx, { clientId: clientA, projectId: projectA });
    taskB = await insertTask(tx, { clientId: clientB, projectId: projectB });
  });
});

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    await deleteRequestsAndUsers(owner, {
      clientIds: [clientA, clientB],
      userIds: [submitterId],
    });
    // Projects cascade to their Tasks; clients don't cascade.
    await owner.query("delete from projects where client_id = any($1)", [
      [clientA, clientB],
    ]);
    await deleteClients(owner, [clientA, clientB]);
  } finally {
    await owner.end();
    await db.close();
  }
});

type RequestOverrides = Omit<
  Parameters<typeof insertRequest>[1],
  "clientId" | "submitterId"
>;

// The refused insert's Postgres error, or "applied" if nothing refused it.
async function insertForClientA(
  overrides: RequestOverrides,
): Promise<{ code: string; message: string } | "applied"> {
  return db
    .withSystem((tx) =>
      insertRequest(tx, { clientId: clientA, submitterId, ...overrides }),
    )
    .then(() => "applied" as const)
    .catch((error: unknown) => {
      const pgError = getPgError(error);
      if (pgError === null) throw error;
      return pgError;
    });
}

function checkViolation(constraint: string): unknown {
  return {
    code: CHECK_VIOLATION,
    message: expect.stringContaining(constraint),
  };
}

describe("requests CHECKs", () => {
  it.each(["NEW", "DECLINED", "WITHDRAWN"] as const)(
    "refuses a Task link on a %s Request",
    async (status) => {
      const outcome = await insertForClientA({
        status,
        taskId: taskA,
        taskTitle: "Fix login",
      });

      expect(outcome).toEqual(checkViolation("requests_task_link_status"));
    },
  );

  it.each(["ACCEPTED", "DONE"] as const)(
    "allows a Task link on a %s Request",
    async (status) => {
      const outcome = await insertForClientA({
        status,
        taskId: taskA,
        taskTitle: "Fix login",
      });

      expect(outcome).toBe("applied");
    },
  );

  it("refuses a Task title without an Accepted or Done status", async () => {
    const outcome = await insertForClientA({
      status: "DECLINED",
      taskTitle: "Fix login",
    });

    expect(outcome).toEqual(checkViolation("requests_task_link_status"));
  });

  it("refuses a Task link without its title", async () => {
    const outcome = await insertForClientA({
      status: "ACCEPTED",
      taskId: taskA,
    });

    expect(outcome).toEqual(checkViolation("requests_task_title_present"));
  });

  it("allows a Task title whose Task is gone on an Accepted Request", async () => {
    const outcome = await insertForClientA({
      status: "ACCEPTED",
      taskTitle: "Fix login",
    });

    expect(outcome).toBe("applied");
  });

  it.each([
    { field: "title", value: "", constraint: "requests_title_length" },
    {
      field: "title",
      value: "x".repeat(TITLE_MAX + 1),
      constraint: "requests_title_length",
    },
    {
      field: "description",
      value: "",
      constraint: "requests_description_length",
    },
    {
      field: "description",
      value: "x".repeat(TEXT_MAX + 1),
      constraint: "requests_description_length",
    },
    {
      field: "responseNote",
      value: "",
      constraint: "requests_response_note_length",
    },
    {
      field: "responseNote",
      value: "x".repeat(TEXT_MAX + 1),
      constraint: "requests_response_note_length",
    },
  ])(
    "refuses a $field of $value.length characters",
    async ({ field, value, constraint }) => {
      const outcome = await insertForClientA({ [field]: value });

      expect(outcome).toEqual(checkViolation(constraint));
    },
  );

  it("allows a title, description and response note at their longest", async () => {
    const outcome = await insertForClientA({
      title: "x".repeat(TITLE_MAX),
      description: "x".repeat(TEXT_MAX),
      responseNote: "x".repeat(TEXT_MAX),
    });

    expect(outcome).toBe("applied");
  });
});

describe("requests status_changed_at", () => {
  const PAST = new Date("2020-01-01T00:00:00Z");

  async function updateAndRead(
    set: Partial<typeof requests.$inferInsert>,
  ): Promise<Date> {
    return db.withSystem(async (tx) => {
      const request = await insertRequest(tx, {
        clientId: clientA,
        submitterId,
        statusChangedAt: PAST,
      });
      await tx.update(requests).set(set).where(eq(requests.id, request.id));
      const [row] = await tx
        .select({ statusChangedAt: requests.statusChangedAt })
        .from(requests)
        .where(eq(requests.id, request.id));
      return row.statusChangedAt;
    });
  }

  it("moves to now when the status changes", async () => {
    const statusChangedAt = await updateAndRead({ status: "DECLINED" });

    expect(statusChangedAt.getTime()).toBeGreaterThan(PAST.getTime());
  });

  it("stays when a save leaves the status as it was", async () => {
    const statusChangedAt = await updateAndRead({
      status: "NEW",
      responseNote: "Looking into it",
    });

    expect(statusChangedAt).toEqual(PAST);
  });
});

describe("requests FKs", () => {
  it("refuses a Project of another Client", async () => {
    const outcome = await insertForClientA({ projectId: projectB });

    expect(outcome).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      message: expect.stringContaining("requests_project_fk"),
    });
  });

  it("refuses a Task of another Client", async () => {
    const outcome = await insertForClientA({
      status: "ACCEPTED",
      taskId: taskB,
      taskTitle: "Fix login",
    });

    expect(outcome).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      message: expect.stringContaining("requests_task_fk"),
    });
  });

  it("keeps the Request and its Client when its Project is deleted", async () => {
    const row = await db.withSystem(async (tx) => {
      const projectId = await insertProject(tx, { clientId: clientA });
      const taskId = await insertTask(tx, { clientId: clientA, projectId });
      const request = await insertRequest(tx, {
        clientId: clientA,
        submitterId,
        projectId,
        status: "ACCEPTED",
        taskId,
        taskTitle: "Fix login",
      });

      // Cascades to the Task too.
      await tx.delete(projects).where(eq(projects.id, projectId));

      const [found] = await tx
        .select({
          clientId: requests.clientId,
          projectId: requests.projectId,
          taskId: requests.taskId,
          taskTitle: requests.taskTitle,
        })
        .from(requests)
        .where(eq(requests.id, request.id));
      return found;
    });

    expect(row).toEqual({
      clientId: clientA,
      projectId: null,
      taskId: null,
      taskTitle: "Fix login",
    });
  });

  it("keeps the Task title when the linked Task is deleted", async () => {
    const row = await db.withSystem(async (tx) => {
      const taskId = await insertTask(tx, {
        clientId: clientA,
        projectId: projectA,
      });
      const request = await insertRequest(tx, {
        clientId: clientA,
        submitterId,
        projectId: projectA,
        status: "DONE",
        taskId,
        taskTitle: "Fix login",
      });

      await tx.delete(tasks).where(eq(tasks.id, taskId));

      const [found] = await tx
        .select({
          clientId: requests.clientId,
          projectId: requests.projectId,
          status: requests.status,
          taskId: requests.taskId,
          taskTitle: requests.taskTitle,
        })
        .from(requests)
        .where(eq(requests.id, request.id));
      return found;
    });

    expect(row).toEqual({
      clientId: clientA,
      projectId: projectA,
      status: "DONE",
      taskId: null,
      taskTitle: "Fix login",
    });
  });
});
