import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClientStatus,
  createBoardSync,
  getClientStatus,
} from "@/lib/board-sync/board-sync";
import { createDb } from "@/lib/db/db";
import {
  clients,
  githubBoards,
  milestones,
  projects,
  projectStatusMappings,
  statusUpdates,
  tasks,
} from "@/lib/db/schema";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import { type PmBoard, PmSourceError } from "@/lib/pm-source/pm-source";
import { insertProject } from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";
import {
  buildBoard,
  buildIssue,
  buildStatusOption,
  buildStatusUpdate,
  FakePmSource,
} from "../../support/pm-board";

const NOW = new Date("2026-10-14T15:00:00Z");

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const createdClientIds: string[] = [];
const createdBoardIds: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

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

type Seeded = { clientId: string; projectId: string; nodeId: string };

// A linked Project of a fresh Client, for a board with this node id.
async function seedProject(
  options: { isArchived?: boolean; isUnlinked?: boolean } = {},
): Promise<Seeded> {
  const clientId = randomUUID();
  const nodeId = `PVT_${randomUUID()}`;
  createdClientIds.push(clientId);
  const projectId = await db.withSystem(async (tx) => {
    await insertClients(tx, [clientId]);
    if (options.isArchived) {
      await tx
        .update(clients)
        .set({ archivedAt: NOW })
        .where(eq(clients.id, clientId));
    }
    return insertProject(tx, {
      clientId,
      githubProjectNodeId: nodeId,
      unlinkedAt: options.isUnlinked ? NOW : null,
    });
  });
  return { clientId, projectId, nodeId };
}

function createSync(pmSource: FakePmSource | null = new FakePmSource()) {
  return createBoardSync({ db, pmSource, now: () => NOW });
}

// A synced board: seeds a Project, serves `board` for it and syncs once.
async function syncBoard(
  board: Partial<PmBoard>,
): Promise<Seeded & { pmSource: FakePmSource }> {
  const seeded = await seedProject();
  const pmSource = new FakePmSource();
  pmSource.setBoard(
    seeded.nodeId,
    buildBoard({ ...board, nodeId: seeded.nodeId }),
  );
  const result = await createSync(pmSource).syncProject(seeded.projectId);
  expect(result.error).toBeNull();
  return { ...seeded, pmSource };
}

function getTasks(projectId: string) {
  return db.withSystem((tx) =>
    tx
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.title)),
  );
}

function getProject(projectId: string) {
  return db.withSystem(async (tx) => {
    const [row] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    return row;
  });
}

// Every mirrored row of a Project, to show a sync changed nothing.
function getMirror(projectId: string) {
  return db.withSystem(async (tx) => ({
    project: (
      await tx.select().from(projects).where(eq(projects.id, projectId))
    )[0],
    tasks: await tx
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.id)),
    milestones: await tx
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.id)),
    statusUpdates: await tx
      .select()
      .from(statusUpdates)
      .where(eq(statusUpdates.projectId, projectId))
      .orderBy(asc(statusUpdates.id)),
    mappings: await tx
      .select()
      .from(projectStatusMappings)
      .where(eq(projectStatusMappings.projectId, projectId))
      .orderBy(asc(projectStatusMappings.id)),
  }));
}

async function insertPoolBoard(nodeId: string): Promise<void> {
  createdBoardIds.push(nodeId);
  await db.withSystem((tx) =>
    tx.insert(githubBoards).values({
      nodeId,
      number: 1,
      title: "Pooled board",
      url: "https://github.com/orgs/neves-labs/projects/1",
      closed: false,
      githubUpdatedAt: NOW,
      refreshedAt: NOW,
    }),
  );
}

async function getPoolNodeIds(nodeIds: string[]): Promise<string[]> {
  const rows = await db.withSystem((tx) =>
    tx
      .select({ nodeId: githubBoards.nodeId })
      .from(githubBoards)
      .where(inArray(githubBoards.nodeId, nodeIds)),
  );
  return rows.map((row) => row.nodeId);
}

describe("syncProject: tasks", () => {
  it("mirrors Visible issues as tasks with every field", async () => {
    const closedAt = new Date("2026-10-10T09:30:00Z");
    const issue = buildIssue({
      title: "Ship the invoice page",
      closedAt,
      milestone: { title: "Beta", dueOn: "2026-11-01" },
      statusOptionId: "opt_done",
      clientNote: "Live on staging",
      targetDate: "2026-10-20",
    });
    const { projectId } = await syncBoard({ items: [issue] });

    const [task] = await getTasks(projectId);
    const [milestone] = await db.withSystem((tx) =>
      tx.select().from(milestones).where(eq(milestones.projectId, projectId)),
    );
    expect(task).toMatchObject({
      githubItemNodeId: issue.itemNodeId,
      githubIssueNodeId: issue.issueNodeId,
      githubRepositoryNodeId: issue.repositoryNodeId,
      title: "Ship the invoice page",
      clientNote: "Live on staging",
      targetDate: "2026-10-20",
      completedAt: closedAt,
      statusOptionId: "opt_done",
      milestoneId: milestone.id,
      hiddenAt: null,
    });
  });

  it("writes an entry GitHub returned twice (moved between pages) once", async () => {
    const option = buildStatusOption("Todo");
    const update = buildStatusUpdate();
    const issue = buildIssue({ title: "Old position" });
    const moved = { ...issue, title: "New position" };
    const unreadable = {
      kind: "unreadable",
      itemNodeId: `PVTI_${randomUUID()}`,
    } as const;
    const { projectId } = await syncBoard({
      statusOptions: [option, option],
      items: [issue, unreadable, moved, unreadable],
      statusUpdates: [update, update],
    });

    const { project, ...children } = await getMirror(projectId);
    expect(children.tasks.map((row) => row.title)).toEqual(["New position"]);
    expect(children.mappings).toHaveLength(1);
    expect(children.statusUpdates).toHaveLength(1);
    expect(project.syncWarnings).toEqual([
      { kind: "unreadable-items", count: 1 },
    ]);
  });

  it("ignores Internal, untagged, PR, draft and unreadable items", async () => {
    const { projectId } = await syncBoard({
      items: [
        buildIssue({ title: "Visible" }),
        buildIssue({ title: "Internal", visibility: "Internal" }),
        buildIssue({ title: "Untagged", visibility: null }),
        { kind: "other", itemNodeId: `PVTI_${randomUUID()}` },
        { kind: "unreadable", itemNodeId: `PVTI_${randomUUID()}` },
      ],
    });

    const rows = await getTasks(projectId);
    expect(rows.map((row) => row.title)).toEqual(["Visible"]);
  });
});

describe("syncProject: soft-hiding tasks", () => {
  it("hides a task once when it goes Internal or leaves the board", async () => {
    const internal = buildIssue({ title: "Goes internal" });
    const leaving = buildIssue({ title: "Leaves" });
    const { projectId, nodeId, pmSource } = await syncBoard({
      items: [internal, leaving],
    });
    pmSource.setBoard(
      nodeId,
      buildBoard({ nodeId, items: [{ ...internal, visibility: "Internal" }] }),
    );
    await createSync(pmSource).syncProject(projectId);
    const later = new Date(NOW.getTime() + 60_000);
    await createBoardSync({
      db,
      pmSource,
      now: () => later,
    }).syncProject(projectId);

    const rows = await getTasks(projectId);
    expect(rows.map((row) => [row.title, row.hiddenAt])).toEqual([
      ["Goes internal", NOW],
      ["Leaves", NOW],
    ]);
  });

  it("unhides a task made Visible again", async () => {
    const issue = buildIssue({ visibility: "Internal" });
    const visible = buildBoard({
      items: [{ ...issue, visibility: "Visible" }],
    });
    const { projectId, nodeId, pmSource } = await syncBoard(visible);
    pmSource.setBoard(
      nodeId,
      buildBoard({ nodeId, items: [issue] }),
      buildBoard({ ...visible, nodeId }),
    );
    const sync = createSync(pmSource);
    await sync.syncProject(projectId);
    await sync.syncProject(projectId);

    const [task] = await getTasks(projectId);
    expect(task.hiddenAt).toBeNull();
  });

  it("hides every task when the board loses Client visibility", async () => {
    const issue = buildIssue();
    const { projectId, nodeId, pmSource } = await syncBoard({ items: [issue] });
    pmSource.setBoard(
      nodeId,
      buildBoard({
        nodeId,
        // The adapter reads visibility as null when the field is missing.
        items: [{ ...issue, visibility: null }],
        fields: { clientVisibility: false, clientNote: true, targetDate: true },
      }),
    );
    await createSync(pmSource).syncProject(projectId);

    const [task] = await getTasks(projectId);
    const project = await getProject(projectId);
    expect(task.hiddenAt).toEqual(NOW);
    expect(project.syncWarnings).toEqual([
      { kind: "missing-field", field: "Client visibility" },
    ]);
  });
});

describe("syncProject: warnings", () => {
  it("warns once per missing field and per batch of unreadable items", async () => {
    const { projectId } = await syncBoard({
      fields: { clientVisibility: false, clientNote: false, targetDate: false },
      items: [
        { kind: "unreadable", itemNodeId: `PVTI_${randomUUID()}` },
        { kind: "unreadable", itemNodeId: `PVTI_${randomUUID()}` },
        { kind: "other", itemNodeId: `PVTI_${randomUUID()}` },
      ],
    });

    const project = await getProject(projectId);
    expect(project.syncWarnings).toEqual([
      { kind: "missing-field", field: "Client visibility" },
      { kind: "missing-field", field: "Client note" },
      { kind: "missing-field", field: "Target date" },
      { kind: "unreadable-items", count: 2 },
    ]);
  });

  it("replaces the previous sync's warnings", async () => {
    const { projectId, nodeId, pmSource } = await syncBoard({
      fields: { clientVisibility: true, clientNote: false, targetDate: true },
    });
    pmSource.setBoard(
      nodeId,
      buildBoard({
        nodeId,
        fields: { clientVisibility: true, clientNote: true, targetDate: false },
      }),
    );
    await createSync(pmSource).syncProject(projectId);

    const project = await getProject(projectId);
    expect(project.syncWarnings).toEqual([
      { kind: "missing-field", field: "Target date" },
    ]);
  });
});

describe("syncProject: status mappings", () => {
  function getMappings(projectId: string) {
    return db.withSystem((tx) =>
      tx
        .select({
          githubOptionId: projectStatusMappings.githubOptionId,
          optionName: projectStatusMappings.optionName,
          clientStatus: projectStatusMappings.clientStatus,
        })
        .from(projectStatusMappings)
        .where(eq(projectStatusMappings.projectId, projectId))
        .orderBy(asc(projectStatusMappings.optionName)),
    );
  }

  it("adds new options Unmapped, renames in place and drops removed ones", async () => {
    const todo = buildStatusOption("Todo");
    const review = buildStatusOption("Review");
    const gone = buildStatusOption("Gone");
    const { projectId, nodeId, pmSource } = await syncBoard({
      statusOptions: [todo, review, gone],
    });
    await db.withSystem((tx) =>
      tx
        .update(projectStatusMappings)
        .set({ clientStatus: "IN_PROGRESS" })
        .where(eq(projectStatusMappings.githubOptionId, review.id)),
    );
    const added = buildStatusOption("Added");
    pmSource.setBoard(
      nodeId,
      buildBoard({
        nodeId,
        statusOptions: [todo, { ...review, name: "In review" }, added],
      }),
    );
    await createSync(pmSource).syncProject(projectId);

    expect(await getMappings(projectId)).toEqual([
      { githubOptionId: added.id, optionName: "Added", clientStatus: null },
      {
        githubOptionId: review.id,
        optionName: "In review",
        clientStatus: "IN_PROGRESS",
      },
      { githubOptionId: todo.id, optionName: "Todo", clientStatus: null },
    ]);
  });
});

describe("getClientStatus", () => {
  const mappings = new Map<string, ClientStatus | null>([
    ["opt_done", "DONE"],
    ["opt_unmapped", null],
  ]);

  it("is Up next without a Status option", () => {
    expect(getClientStatus(null, mappings)).toBe("UP_NEXT");
  });

  it("is the mapped status for a mapped option", () => {
    expect(getClientStatus("opt_done", mappings)).toBe("DONE");
  });

  it("is In progress for an Unmapped option or one with no mapping row", () => {
    expect(getClientStatus("opt_unmapped", mappings)).toBe("IN_PROGRESS");
    expect(getClientStatus("opt_unknown", mappings)).toBe("IN_PROGRESS");
  });
});

describe("syncProject: milestones", () => {
  function getMilestones(projectId: string) {
    return db.withSystem((tx) =>
      tx
        .select({
          id: milestones.id,
          title: milestones.title,
          dueDate: milestones.dueDate,
        })
        .from(milestones)
        .where(eq(milestones.projectId, projectId))
        .orderBy(asc(milestones.title)),
    );
  }

  it("merges one title across repos with the earliest due date and warns on the mismatch", async () => {
    const { projectId } = await syncBoard({
      items: [
        buildIssue({ milestone: { title: "Beta", dueOn: "2026-11-15" } }),
        buildIssue({ milestone: { title: "Beta", dueOn: "2026-11-01" } }),
        buildIssue({ milestone: { title: "Beta", dueOn: null } }),
      ],
    });

    const rows = await getMilestones(projectId);
    const project = await getProject(projectId);
    const taskRows = await getTasks(projectId);
    expect(rows).toMatchObject([{ title: "Beta", dueDate: "2026-11-01" }]);
    expect(taskRows.map((row) => row.milestoneId)).toEqual([
      rows[0].id,
      rows[0].id,
      rows[0].id,
    ]);
    expect(project.syncWarnings).toEqual([
      {
        kind: "milestone-date-mismatch",
        title: "Beta",
        dueDates: ["2026-11-01", "2026-11-15"],
      },
    ]);
  });

  it("doesn't warn when the repos' dates agree, and keeps a null date when all are null", async () => {
    const { projectId } = await syncBoard({
      items: [
        buildIssue({ milestone: { title: "Beta", dueOn: "2026-11-01" } }),
        buildIssue({ milestone: { title: "Beta", dueOn: "2026-11-01" } }),
        buildIssue({ milestone: { title: "Later", dueOn: null } }),
      ],
    });

    const rows = await getMilestones(projectId);
    const project = await getProject(projectId);
    expect(rows).toMatchObject([
      { title: "Beta", dueDate: "2026-11-01" },
      { title: "Later", dueDate: null },
    ]);
    expect(project.syncWarnings).toEqual([]);
  });

  it("never stores a milestone only Internal items use", async () => {
    const { projectId } = await syncBoard({
      items: [
        buildIssue({
          visibility: "Internal",
          milestone: { title: "Secret rewrite", dueOn: "2026-12-01" },
        }),
      ],
    });

    expect(await getMilestones(projectId)).toEqual([]);
  });

  it("deletes a milestone no Visible task uses and nulls its hidden tasks' link", async () => {
    const issue = buildIssue({ milestone: { title: "Beta", dueOn: null } });
    const { projectId, nodeId, pmSource } = await syncBoard({ items: [issue] });
    pmSource.setBoard(
      nodeId,
      buildBoard({ nodeId, items: [{ ...issue, visibility: "Internal" }] }),
    );
    await createSync(pmSource).syncProject(projectId);

    const [task] = await getTasks(projectId);
    expect(await getMilestones(projectId)).toEqual([]);
    expect(task).toMatchObject({ hiddenAt: NOW, milestoneId: null });
  });
});

describe("syncProject: status updates", () => {
  function getStatusUpdates(projectId: string) {
    return db.withSystem((tx) =>
      tx
        .select({
          githubNodeId: statusUpdates.githubNodeId,
          health: statusUpdates.health,
          startDate: statusUpdates.startDate,
          targetDate: statusUpdates.targetDate,
          body: statusUpdates.body,
          githubCreatedAt: statusUpdates.githubCreatedAt,
        })
        .from(statusUpdates)
        .where(eq(statusUpdates.projectId, projectId)),
    );
  }

  it("upserts updates, deletes ones gone from GitHub and keeps a null health", async () => {
    const kept = buildStatusUpdate({ body: "First draft" });
    const deleted = buildStatusUpdate();
    const { projectId, nodeId, pmSource } = await syncBoard({
      statusUpdates: [kept, deleted],
    });
    const edited = {
      ...kept,
      health: null,
      startDate: "2026-10-01",
      targetDate: "2026-12-01",
      body: "Edited",
    };
    pmSource.setBoard(nodeId, buildBoard({ nodeId, statusUpdates: [edited] }));
    await createSync(pmSource).syncProject(projectId);

    expect(await getStatusUpdates(projectId)).toEqual([
      {
        githubNodeId: kept.nodeId,
        health: null,
        startDate: "2026-10-01",
        targetDate: "2026-12-01",
        body: "Edited",
        githubCreatedAt: kept.createdAt,
      },
    ]);
  });
});

describe("syncProject: the Project row", () => {
  it("mirrors the board and marks a closed board, which keeps syncing until reopened", async () => {
    const { projectId, nodeId, pmSource } = await syncBoard({
      title: "Renamed board",
      number: 12,
      url: "https://github.com/orgs/neves-labs/projects/12",
      closed: true,
      items: [buildIssue({ title: "Synced while closed" })],
    });
    const closed = await getProject(projectId);
    pmSource.setBoard(nodeId, buildBoard({ nodeId, closed: false }));
    await createSync(pmSource).syncProject(projectId);
    const reopened = await getProject(projectId);

    expect(closed).toMatchObject({
      name: "Renamed board",
      githubProjectNumber: 12,
      url: "https://github.com/orgs/neves-labs/projects/12",
      closedOnGithub: true,
      lastSyncedAt: NOW,
      lastSyncError: null,
    });
    expect((await getTasks(projectId)).map((row) => row.title)).toEqual([
      "Synced while closed",
    ]);
    expect(reopened.closedOnGithub).toBe(false);
  });

  it("freezes the Project and drops its pool row when the board is gone", async () => {
    const { projectId, nodeId, pmSource } = await syncBoard({
      items: [buildIssue({ milestone: { title: "Beta", dueOn: null } })],
      statusUpdates: [buildStatusUpdate()],
      statusOptions: [buildStatusOption("Todo")],
    });
    await insertPoolBoard(nodeId);
    const before = await getMirror(projectId);
    pmSource.setBoard(nodeId, null);
    const later = new Date(NOW.getTime() + 60_000);

    const result = await createBoardSync({
      db,
      pmSource,
      now: () => later,
    }).syncProject(projectId);

    const { project, ...children } = await getMirror(projectId);
    const { project: projectBefore, ...childrenBefore } = before;
    expect(result.error).toBeNull();
    expect(project).toEqual({ ...projectBefore, unlinkedAt: later });
    expect(children).toEqual(childrenBefore);
    expect(await getPoolNodeIds([nodeId])).toEqual([]);
  });
});

describe("syncProject: failures", () => {
  it("rolls back on a PmSourceError, records its message and keeps last_synced_at", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { projectId, nodeId, pmSource } = await syncBoard({
      items: [buildIssue()],
      statusUpdates: [buildStatusUpdate()],
    });
    const before = await getMirror(projectId);
    pmSource.setBoard(nodeId, new PmSourceError("GitHub rate limit hit"));

    const result = await createSync(pmSource).syncProject(projectId);

    const { project, ...children } = await getMirror(projectId);
    const { project: projectBefore, ...childrenBefore } = before;
    expect(result).toEqual({ value: null, error: "sync-failed", status: 502 });
    expect(project).toEqual({
      ...projectBefore,
      lastSyncError: "GitHub rate limit hit",
    });
    expect(children).toEqual(childrenBefore);
    // Ids and the error's name only, never board content.
    expect(console.error).toHaveBeenCalledWith(
      `board-sync: sync of project ${projectId} failed: PmSourceError`,
    );
  });

  it("rolls back writes made before a failure and records a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { projectId, nodeId, pmSource } = await syncBoard({
      items: [buildIssue({ title: "Before" })],
    });
    const before = await getMirror(projectId);
    // Fails mid-write: the Project row and tasks are already written when
    // Postgres rejects the status update's impossible date.
    pmSource.setBoard(
      nodeId,
      buildBoard({
        nodeId,
        title: "Never written",
        items: [buildIssue({ title: "After" })],
        statusUpdates: [buildStatusUpdate({ targetDate: "2026-13-45" })],
      }),
    );

    const result = await createSync(pmSource).syncProject(projectId);

    const { project, ...children } = await getMirror(projectId);
    const { project: projectBefore, ...childrenBefore } = before;
    expect(result.error).toBe("sync-failed");
    expect(project).toEqual({ ...projectBefore, lastSyncError: "Sync failed" });
    expect(children).toEqual(childrenBefore);
  });

  it("clears the recorded error on the next successful sync", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seeded = await seedProject();
    const pmSource = new FakePmSource();
    pmSource.setBoard(
      seeded.nodeId,
      new PmSourceError("GitHub is unavailable"),
      buildBoard({ nodeId: seeded.nodeId }),
    );
    const sync = createSync(pmSource);
    await sync.syncProject(seeded.projectId);

    const result = await sync.syncProject(seeded.projectId);

    const project = await getProject(seeded.projectId);
    expect(result.error).toBeNull();
    expect(project).toMatchObject({ lastSyncError: null, lastSyncedAt: NOW });
  });
});

describe("syncProject: skipped Projects", () => {
  it("never fetches or changes an archived Client's Project", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { projectId, nodeId } = await seedProject({ isArchived: true });
    const before = await getProject(projectId);
    const pmSource = new FakePmSource();
    pmSource.setBoard(nodeId, buildBoard({ nodeId, title: "Changed" }));

    const result = await createSync(pmSource).syncProject(projectId);

    expect(result).toEqual({ value: null, error: "archived", status: 409 });
    expect(pmSource.getBoardCalls).toEqual([]);
    expect(await getProject(projectId)).toEqual(before);
  });

  it("never fetches or changes an unlinked Project", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { projectId, nodeId } = await seedProject({ isUnlinked: true });
    const before = await getProject(projectId);
    const pmSource = new FakePmSource();
    pmSource.setBoard(nodeId, buildBoard({ nodeId, title: "Changed" }));

    const result = await createSync(pmSource).syncProject(projectId);

    expect(result).toEqual({ value: null, error: "unlinked", status: 409 });
    expect(pmSource.getBoardCalls).toEqual([]);
    expect(await getProject(projectId)).toEqual(before);
  });

  it("is not-found for an unknown Project", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createSync().syncProject(randomUUID());

    expect(result).toEqual({ value: null, error: "not-found", status: 404 });
  });

  it("is not-found for a malformed Project id", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createSync().syncProject("not-a-uuid");

    expect(result).toEqual({ value: null, error: "not-found", status: 404 });
  });
});

describe("syncProject: concurrency", () => {
  it("serializes two syncs of one Project, leaving the later fetch's rows", async () => {
    const { projectId, nodeId } = await seedProject();
    const pmSource = new FakePmSource();
    pmSource.setBoard(
      nodeId,
      buildBoard({ nodeId, title: "First fetch", items: [buildIssue()] }),
      buildBoard({
        nodeId,
        title: "Later fetch",
        items: [buildIssue({ title: "Only in the later fetch" })],
      }),
    );
    // Without the lock, the slow first fetch would commit last.
    pmSource.nextGetBoardDelayMs = 200;
    const sync = createSync(pmSource);

    const results = await Promise.all([
      sync.syncProject(projectId),
      sync.syncProject(projectId),
    ]);

    const project = await getProject(projectId);
    const visibleTitles = (await getTasks(projectId))
      .filter((row) => row.hiddenAt === null)
      .map((row) => row.title);
    expect(results.map((result) => result.error)).toEqual([null, null]);
    expect(project.name).toBe("Later fetch");
    expect(visibleTitles).toEqual(["Only in the later fetch"]);
  });
});

describe("trigger methods", () => {
  // A synced Project whose one task comes from `issue`, served unchanged
  // afterwards; the next sync shows up as a new getBoard call.
  async function syncBoardWithIssue(
    issue: ReturnType<typeof buildIssue>,
    options: { isArchived?: boolean } = {},
  ): Promise<Seeded & { pmSource: FakePmSource }> {
    const synced = await syncBoard({ items: [issue] });
    if (options.isArchived) {
      await db.withSystem((tx) =>
        tx
          .update(clients)
          .set({ archivedAt: NOW })
          .where(eq(clients.id, synced.clientId)),
      );
    }
    synced.pmSource.getBoardCalls.length = 0;
    return synced;
  }

  function buildSharedPmSource(boards: Seeded[]): FakePmSource {
    const pmSource = new FakePmSource();
    for (const { nodeId } of boards) {
      pmSource.setBoard(nodeId, buildBoard({ nodeId }));
    }
    return pmSource;
  }

  it("syncBoardByNodeId syncs the linked Project with that board", async () => {
    const seeded = await seedProject();
    const pmSource = buildSharedPmSource([seeded]);

    await createSync(pmSource).syncBoardByNodeId(seeded.nodeId);

    expect(pmSource.getBoardCalls).toEqual([seeded.nodeId]);
    expect((await getProject(seeded.projectId)).lastSyncedAt).toEqual(NOW);
  });

  it("syncBoardByNodeId ignores an unlinked or archived Project and an unknown board", async () => {
    const unlinked = await seedProject({ isUnlinked: true });
    const archived = await seedProject({ isArchived: true });
    const pmSource = buildSharedPmSource([unlinked, archived]);
    const sync = createSync(pmSource);

    await sync.syncBoardByNodeId(unlinked.nodeId);
    await sync.syncBoardByNodeId(archived.nodeId);
    await sync.syncBoardByNodeId(`PVT_${randomUUID()}`);

    expect(pmSource.getBoardCalls).toEqual([]);
  });

  it("syncBoardsWithIssue syncs exactly the eligible Projects with a row for the issue, hidden or not", async () => {
    const issueNodeId = `I_${randomUUID()}`;
    const visible = await syncBoardWithIssue(buildIssue({ issueNodeId }));
    const hidden = await syncBoardWithIssue(buildIssue({ issueNodeId }));
    await db.withSystem((tx) =>
      tx
        .update(tasks)
        .set({ hiddenAt: NOW })
        .where(eq(tasks.projectId, hidden.projectId)),
    );
    const archived = await syncBoardWithIssue(buildIssue({ issueNodeId }), {
      isArchived: true,
    });
    const unrelated = await syncBoardWithIssue(buildIssue());
    const pmSource = buildSharedPmSource([
      visible,
      hidden,
      archived,
      unrelated,
    ]);

    await createSync(pmSource).syncBoardsWithIssue(issueNodeId);

    expect(pmSource.getBoardCalls.toSorted()).toEqual(
      [visible.nodeId, hidden.nodeId].toSorted(),
    );
  });

  it("syncBoardsWithRepository syncs exactly the eligible Projects with a row from the repo", async () => {
    const repositoryNodeId = `R_${randomUUID()}`;
    const first = await syncBoardWithIssue(buildIssue({ repositoryNodeId }));
    const second = await syncBoardWithIssue(buildIssue({ repositoryNodeId }));
    const unlinked = await syncBoardWithIssue(buildIssue({ repositoryNodeId }));
    await db.withSystem((tx) =>
      tx
        .update(projects)
        .set({ unlinkedAt: NOW })
        .where(eq(projects.id, unlinked.projectId)),
    );
    const unrelated = await syncBoardWithIssue(buildIssue());
    const pmSource = buildSharedPmSource([first, second, unlinked, unrelated]);

    await createSync(pmSource).syncBoardsWithRepository(repositoryNodeId);

    expect(pmSource.getBoardCalls.toSorted()).toEqual(
      [first.nodeId, second.nodeId].toSorted(),
    );
  });

  it("swallows a recorded sync failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seeded = await seedProject();
    const pmSource = new FakePmSource();
    pmSource.setBoard(seeded.nodeId, new PmSourceError("GitHub is down"));

    await createSync(pmSource).syncBoardByNodeId(seeded.nodeId);

    expect((await getProject(seeded.projectId)).lastSyncError).toBe(
      "GitHub is down",
    );
  });
});

describe("with GitHub off", () => {
  it("returns github-off from syncProject", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { projectId } = await seedProject();

    const result = await createSync(null).syncProject(projectId);

    expect(result).toEqual({ value: null, error: "github-off", status: 503 });
    expect((await getProject(projectId)).lastSyncedAt).toBeNull();
  });

  it("makes every trigger a no-op and skips reconcile", async () => {
    const { projectId, nodeId } = await seedProject();
    const sync = createSync(null);

    await sync.refreshPool();
    await sync.syncBoardByNodeId(nodeId);
    await sync.syncBoardsWithIssue(`I_${randomUUID()}`);
    await sync.syncBoardsWithRepository(`R_${randomUUID()}`);
    const reconciled = await sync.reconcile();

    expect(reconciled).toEqual({ skipped: true, synced: 0, failed: 0 });
    expect((await getProject(projectId)).lastSyncedAt).toBeNull();
  });
});
