import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDb } from "@/lib/db/db";
import {
  githubBoards,
  milestones,
  projects,
  projectStatusMappings,
  statusUpdates,
  tasks,
} from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import {
  insertMilestone,
  insertProject,
  insertStatusMapping,
  insertStatusUpdate,
  insertTask,
} from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import { getPgError } from "../../support/pg-error";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
// A url a later page might render as a link: it must never run script.
const SCRIPT_URL = "javascript:alert(1)";

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const createdClientIds: string[] = [];
const createdBoardIds: string[] = [];

afterAll(async () => {
  const owner = new pg.Client({
    connectionString: getMigrateEnv().DATABASE_URL_OWNER,
  });
  await owner.connect();
  try {
    // Projects cascade to every other board table; clients don't cascade.
    await owner.query("delete from projects where client_id = any($1)", [
      createdClientIds,
    ]);
    await deleteClients(owner, createdClientIds);
    await owner.query("delete from github_boards where node_id = any($1)", [
      createdBoardIds,
    ]);
  } finally {
    await owner.end();
    await db.close();
  }
});

async function createClients(count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, () => randomUUID());
  createdClientIds.push(...ids);
  await db.withSystem((tx) => insertClients(tx, ids));
  return ids;
}

// The refused statement's Postgres error, or "applied" if nothing refused it.
async function getRefusal(
  run: Promise<unknown>,
): Promise<{ code: string; message: string } | "applied"> {
  return run
    .then(() => "applied" as const)
    .catch((error: unknown) => {
      const pgError = getPgError(error);
      if (pgError === null) throw error;
      return pgError;
    });
}

describe("projects as app_system", () => {
  it("refuses two linked Projects for the same board", async () => {
    const [clientA, clientB] = await createClients(2);
    const boardId = `PVT_${randomUUID()}`;
    await db.withSystem((tx) =>
      insertProject(tx, { clientId: clientA, githubProjectNodeId: boardId }),
    );

    const refusal = await getRefusal(
      db.withSystem((tx) =>
        insertProject(tx, { clientId: clientB, githubProjectNodeId: boardId }),
      ),
    );

    expect(refusal).toEqual({
      code: UNIQUE_VIOLATION,
      message: expect.stringContaining("projects_linked_board_key"),
    });
  });

  it("allows one linked and one unlinked Project for the same board", async () => {
    const [clientA, clientB] = await createClients(2);
    const boardId = `PVT_${randomUUID()}`;

    const rows = await db.withSystem(async (tx) => {
      await insertProject(tx, {
        clientId: clientA,
        githubProjectNodeId: boardId,
        unlinkedAt: new Date(),
      });
      await insertProject(tx, {
        clientId: clientB,
        githubProjectNodeId: boardId,
      });
      return tx
        .select({ clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.githubProjectNodeId, boardId));
    });

    expect(rows.map((row) => row.clientId).toSorted()).toEqual(
      [clientA, clientB].toSorted(),
    );
  });

  it("refuses a second Project for the same Client and board", async () => {
    const [clientId] = await createClients(1);
    const boardId = `PVT_${randomUUID()}`;
    // Unlinked first, so only the (client, board) key can refuse the second.
    await db.withSystem((tx) =>
      insertProject(tx, {
        clientId,
        githubProjectNodeId: boardId,
        unlinkedAt: new Date(),
      }),
    );

    const refusal = await getRefusal(
      db.withSystem((tx) =>
        insertProject(tx, { clientId, githubProjectNodeId: boardId }),
      ),
    );

    expect(refusal).toEqual({
      code: UNIQUE_VIOLATION,
      message: expect.stringContaining(
        "projects_client_id_github_project_node_id_key",
      ),
    });
  });

  it("refuses a Project whose url isn't on github.com", async () => {
    const [clientId] = await createClients(1);

    const refusal = await getRefusal(
      db.withSystem((tx) => insertProject(tx, { clientId, url: SCRIPT_URL })),
    );

    expect(refusal).toEqual({
      code: CHECK_VIOLATION,
      message: expect.stringContaining("projects_url_github"),
    });
  });

  it("deletes a Project's status updates, milestones, tasks and mappings with it", async () => {
    const [clientId] = await createClients(1);

    const remaining = await db.withSystem(async (tx) => {
      const projectId = await insertProject(tx, { clientId });
      const milestoneId = await insertMilestone(tx, { clientId, projectId });
      await insertTask(tx, { clientId, projectId, milestoneId });
      await insertStatusUpdate(tx, { clientId, projectId });
      await insertStatusMapping(tx, { clientId, projectId });

      await tx.delete(projects).where(eq(projects.id, projectId));

      const children = [
        { table: statusUpdates, column: statusUpdates.projectId },
        { table: milestones, column: milestones.projectId },
        { table: tasks, column: tasks.projectId },
        {
          table: projectStatusMappings,
          column: projectStatusMappings.projectId,
        },
      ];
      const counts: number[] = [];
      for (const child of children) {
        const rows = await tx
          .select()
          .from(child.table)
          .where(eq(child.column, projectId));
        counts.push(rows.length);
      }
      return counts;
    });

    expect(remaining).toEqual([0, 0, 0, 0]);
  });
});

describe("tasks as app_system", () => {
  it("keeps a Task with no milestone when its milestone is deleted", async () => {
    const [clientId] = await createClients(1);

    const projectId = await db.withSystem((tx) =>
      insertProject(tx, { clientId }),
    );

    const task = await db.withSystem(async (tx) => {
      const milestoneId = await insertMilestone(tx, { clientId, projectId });
      const taskId = await insertTask(tx, { clientId, projectId, milestoneId });

      await tx.delete(milestones).where(eq(milestones.id, milestoneId));

      const [row] = await tx
        .select({
          milestoneId: tasks.milestoneId,
          projectId: tasks.projectId,
          clientId: tasks.clientId,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId));
      return row;
    });

    expect(task).toEqual({ milestoneId: null, projectId, clientId });
  });

  it("refuses a Task whose milestone belongs to another Project", async () => {
    const [clientId] = await createClients(1);
    const [projectId, otherMilestoneId] = await db.withSystem(async (tx) => {
      const ownProjectId = await insertProject(tx, { clientId });
      const otherProjectId = await insertProject(tx, { clientId });
      const milestoneId = await insertMilestone(tx, {
        clientId,
        projectId: otherProjectId,
      });
      return [ownProjectId, milestoneId];
    });

    const refusal = await getRefusal(
      db.withSystem((tx) =>
        insertTask(tx, { clientId, projectId, milestoneId: otherMilestoneId }),
      ),
    );

    expect(refusal).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      message: expect.stringContaining("tasks_milestone_fk"),
    });
  });

  it("refuses a Task whose Client isn't its Project's", async () => {
    const [clientA, clientB] = await createClients(2);
    const projectId = await db.withSystem((tx) =>
      insertProject(tx, { clientId: clientA }),
    );

    const refusal = await getRefusal(
      db.withSystem((tx) => insertTask(tx, { clientId: clientB, projectId })),
    );

    expect(refusal).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      message: expect.stringContaining("tasks_project_fk"),
    });
  });
});

describe("github_boards as app_system", () => {
  function buildBoard(url: string): typeof githubBoards.$inferInsert {
    const nodeId = `PVT_${randomUUID()}`;
    createdBoardIds.push(nodeId);
    return {
      nodeId,
      number: 1,
      title: "Test board",
      url,
      closed: false,
      githubUpdatedAt: new Date(),
      refreshedAt: new Date(),
    };
  }

  it("stores a board whose url is on github.com", async () => {
    const board = buildBoard("https://github.com/orgs/test/projects/1");

    const rows = await db.withSystem(async (tx) => {
      await tx.insert(githubBoards).values(board);
      return tx
        .select({ url: githubBoards.url })
        .from(githubBoards)
        .where(inArray(githubBoards.nodeId, [board.nodeId]));
    });

    expect(rows).toEqual([{ url: "https://github.com/orgs/test/projects/1" }]);
  });

  it("refuses a board whose url isn't on github.com", async () => {
    const refusal = await getRefusal(
      db.withSystem((tx) =>
        tx.insert(githubBoards).values(buildBoard(SCRIPT_URL)),
      ),
    );

    expect(refusal).toEqual({
      code: CHECK_VIOLATION,
      message: expect.stringContaining("github_boards_url_github"),
    });
  });
});
