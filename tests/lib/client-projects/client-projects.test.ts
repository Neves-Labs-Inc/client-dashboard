import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createClientProjects } from "@/lib/client-projects/client-projects";
import { createDb, type Tx } from "@/lib/db/db";
import { getAppEnv, getMigrateEnv } from "@/lib/env";
import {
  insertMilestone,
  insertProject,
  insertStatusMapping,
  insertStatusUpdate,
  insertTask,
} from "../../support/board";
import { deleteClients, insertClients } from "../../support/clients";

const env = getAppEnv();
const db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
const clientProjects = createClientProjects({ db });
const createdClientIds: string[] = [];

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
  } finally {
    await owner.end();
    await db.close();
  }
});

// A fresh Client, seeded as app_system (the tenant role can't write).
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

describe("listProjects", () => {
  it("takes health and update time from the newest Status Update", async () => {
    const newest = new Date("2026-10-10T12:00:00Z");
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId,
        health: "OFF_TRACK",
        githubCreatedAt: newest,
      });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId,
        health: "ON_TRACK",
        githubCreatedAt: new Date("2026-10-01T12:00:00Z"),
      });
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary.health).toBe("OFF_TRACK");
    expect(summary.latestUpdateAt).toEqual(newest);
  });

  it("has null health when the newest Status Update has none", async () => {
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId,
        health: null,
        githubCreatedAt: new Date("2026-10-10T12:00:00Z"),
      });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId,
        health: "ON_TRACK",
        githubCreatedAt: new Date("2026-10-01T12:00:00Z"),
      });
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary.health).toBeNull();
    expect(summary.latestUpdateAt).toEqual(new Date("2026-10-10T12:00:00Z"));
  });

  it("has no health, time or note without a Status Update", async () => {
    const clientId = await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id });
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary).toMatchObject({
      health: null,
      latestUpdateAt: null,
      latestNote: null,
      isPast: false,
    });
  });

  it("gives the newest Status Update's body as plain text", async () => {
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId,
        body: "## Week 3\n\nWe **shipped** [login](https://example.com).\n\n- next: billing",
        githubCreatedAt: new Date("2026-10-10T12:00:00Z"),
      });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId,
        body: "Older note",
        githubCreatedAt: new Date("2026-10-01T12:00:00Z"),
      });
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary.latestNote).toBe("Week 3 We shipped login. next: billing");
  });

  it("marks Projects Past by health, GitHub closing or unlinking", async () => {
    const clientId = await seedClient(async (tx, id) => {
      const withHealth = async (
        name: string,
        health: "COMPLETE" | "AT_RISK",
      ) => {
        const projectId = await insertProject(tx, { clientId: id, name });
        await insertStatusUpdate(tx, { clientId: id, projectId, health });
      };
      await withHealth("Complete", "COMPLETE");
      await withHealth("At risk", "AT_RISK");
      const inactiveId = await insertProject(tx, {
        clientId: id,
        name: "Inactive",
      });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId: inactiveId,
        health: "INACTIVE",
      });
      await insertProject(tx, {
        clientId: id,
        name: "Closed",
        closedOnGithub: true,
      });
      await insertProject(tx, {
        clientId: id,
        name: "Unlinked",
        unlinkedAt: new Date(),
      });
    });

    const summaries = await clientProjects.listProjects(clientId);
    const pastByName = Object.fromEntries(
      summaries.map((summary) => [summary.name, summary.isPast]),
    );

    expect(pastByName).toEqual({
      Complete: true,
      Inactive: true,
      Closed: true,
      Unlinked: true,
      "At risk": false,
    });
  });

  it("lists active Projects A-Z, then Past ones A-Z", async () => {
    const clientId = await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id, name: "Zeta" });
      await insertProject(tx, {
        clientId: id,
        name: "Old B",
        closedOnGithub: true,
      });
      await insertProject(tx, { clientId: id, name: "Alpha" });
      await insertProject(tx, {
        clientId: id,
        name: "Old A",
        unlinkedAt: new Date(),
      });
    });

    const summaries = await clientProjects.listProjects(clientId);

    expect(summaries.map((summary) => summary.name)).toEqual([
      "Alpha",
      "Zeta",
      "Old A",
      "Old B",
    ]);
  });

  it("derives each Task's client status from the Project's mapping", async () => {
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      await insertStatusMapping(tx, {
        clientId: id,
        projectId,
        githubOptionId: "opt-done",
        clientStatus: "DONE",
      });
      await insertStatusMapping(tx, {
        clientId: id,
        projectId,
        githubOptionId: "opt-unmapped",
        clientStatus: null,
      });
      const task = (statusOptionId: string | null) =>
        insertTask(tx, { clientId: id, projectId, statusOptionId });
      await task("opt-done");
      await task("opt-unmapped");
      await task("opt-no-row");
      await task(null);
      await task(null);
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary.taskCounts).toEqual({
      UP_NEXT: 2,
      IN_PROGRESS: 2,
      DONE: 1,
    });
  });

  it("picks the current Milestone with its progress", async () => {
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      await insertStatusMapping(tx, {
        clientId: id,
        projectId,
        githubOptionId: "done",
        clientStatus: "DONE",
      });
      const milestone = async (
        title: string,
        dueDate: string | null,
        doneCount: number,
        openCount: number,
      ) => {
        const milestoneId = await insertMilestone(tx, {
          clientId: id,
          projectId,
          title,
          dueDate,
        });
        const statuses = [
          ...Array<string>(doneCount).fill("done"),
          ...Array<string | null>(openCount).fill(null),
        ];
        for (const statusOptionId of statuses) {
          await insertTask(tx, {
            clientId: id,
            projectId,
            milestoneId,
            statusOptionId,
          });
        }
      };
      await milestone("Finished early", "2026-09-01", 2, 0);
      await milestone("Undated", null, 0, 1);
      await milestone("Next", "2026-11-01", 2, 1);
      await milestone("Later", "2026-12-01", 0, 1);
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary.currentMilestone).toEqual({
      title: "Next",
      dueDate: "2026-11-01",
      progress: { done: 2, total: 3, percent: 67 },
    });
  });

  it("falls back to an undated Milestone, then title, then null", async () => {
    const undatedClientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      for (const title of ["Beta", "Alpha"]) {
        const milestoneId = await insertMilestone(tx, {
          clientId: id,
          projectId,
          title,
        });
        await insertTask(tx, { clientId: id, projectId, milestoneId });
      }
    });
    const emptyClientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      await insertTask(tx, { clientId: id, projectId });
    });

    const [undated] = await clientProjects.listProjects(undatedClientId);
    const [empty] = await clientProjects.listProjects(emptyClientId);

    expect(undated.currentMilestone).toEqual({
      title: "Alpha",
      dueDate: null,
      progress: { done: 0, total: 1, percent: 0 },
    });
    expect(empty.currentMilestone).toBeNull();
  });

  it("leaves hidden Tasks out of counts and progress", async () => {
    const clientId = await seedClient(async (tx, id) => {
      const projectId = await insertProject(tx, { clientId: id });
      const milestoneId = await insertMilestone(tx, {
        clientId: id,
        projectId,
        title: "Only",
      });
      await insertTask(tx, { clientId: id, projectId, milestoneId });
      await insertTask(tx, {
        clientId: id,
        projectId,
        milestoneId,
        hiddenAt: new Date(),
      });
    });

    const [summary] = await clientProjects.listProjects(clientId);

    expect(summary.taskCounts).toEqual({ UP_NEXT: 1, IN_PROGRESS: 0, DONE: 0 });
    expect(summary.currentMilestone?.progress).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
  });

  it("never shows another Client's Projects", async () => {
    await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id, name: "Theirs" });
    });
    const clientId = await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id, name: "Mine" });
    });

    const summaries = await clientProjects.listProjects(clientId);

    expect(summaries.map((summary) => summary.name)).toEqual(["Mine"]);
  });
});

describe("countActiveProjects", () => {
  it("counts only the Client's non-Past Projects", async () => {
    await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id });
    });
    const clientId = await seedClient(async (tx, id) => {
      await insertProject(tx, { clientId: id });
      const atRiskId = await insertProject(tx, { clientId: id });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId: atRiskId,
        health: "AT_RISK",
      });
      const completeId = await insertProject(tx, { clientId: id });
      await insertStatusUpdate(tx, {
        clientId: id,
        projectId: completeId,
        health: "COMPLETE",
      });
      await insertProject(tx, { clientId: id, closedOnGithub: true });
    });

    expect(await clientProjects.countActiveProjects(clientId)).toBe(2);
  });
});

describe("getProject", () => {
  it("splits Status Updates into the latest and earlier ones, newest first", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id, name: "Site" });
      for (const day of ["01", "10", "05"]) {
        await insertStatusUpdate(tx, {
          clientId: id,
          projectId,
          body: `Day ${day}`,
          startDate: "2026-09-01",
          targetDate: "2026-12-01",
          githubCreatedAt: new Date(`2026-10-${day}T12:00:00Z`),
        });
      }
    });

    const view = await clientProjects.getProject(clientId, projectId);

    expect(view).toMatchObject({
      id: projectId,
      name: "Site",
      isPast: false,
      latest: {
        health: "ON_TRACK",
        startDate: "2026-09-01",
        targetDate: "2026-12-01",
        body: "Day 10",
        createdAt: new Date("2026-10-10T12:00:00Z"),
      },
    });
    expect(view?.earlier.map((update) => update.body)).toEqual([
      "Day 05",
      "Day 01",
    ]);
  });

  it("has no latest or earlier updates without a Status Update", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id });
    });

    const view = await clientProjects.getProject(clientId, projectId);

    expect(view?.latest).toBeNull();
    expect(view?.earlier).toEqual([]);
  });

  it("orders Milestones and groups their Tasks in order", async () => {
    let projectId = "";
    const completedAt = new Date("2026-10-05T12:00:00Z");
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id });
      await insertStatusMapping(tx, {
        clientId: id,
        projectId,
        githubOptionId: "done",
        clientStatus: "DONE",
      });
      const milestone = async (title: string, dueDate: string | null) => {
        const milestoneId = await insertMilestone(tx, {
          clientId: id,
          projectId,
          title,
          dueDate,
        });
        await insertTask(tx, { clientId: id, projectId, milestoneId });
        return milestoneId;
      };
      await milestone("Undated", null);
      const lateId = await milestone("Late", "2026-12-01");
      await milestone("Early", "2026-11-01");
      // Its only Task is hidden, so the Client never sees its name.
      const hiddenOnlyId = await insertMilestone(tx, {
        clientId: id,
        projectId,
        title: "Internal",
        dueDate: "2026-10-01",
      });
      await insertTask(tx, {
        clientId: id,
        projectId,
        milestoneId: hiddenOnlyId,
        hiddenAt: new Date(),
      });
      const task = (
        input: Omit<Parameters<typeof insertTask>[1], "clientId" | "projectId">,
      ) =>
        insertTask(tx, {
          clientId: id,
          projectId,
          milestoneId: lateId,
          ...input,
        });
      await task({ title: "Later", targetDate: "2026-11-20" });
      await task({ title: "Sooner", targetDate: "2026-11-10" });
      await task({ title: "Undated" });
      await task({ title: "Old", statusOptionId: "done" });
      await task({
        title: "Finished",
        statusOptionId: "done",
        completedAt,
        clientNote: "Shipped",
      });
    });

    const view = await clientProjects.getProject(clientId, projectId);

    expect(view?.milestones.map((milestone) => milestone.title)).toEqual([
      "Early",
      "Late",
      "Undated",
    ]);
    const late = view?.milestones[1];
    expect(late?.dueDate).toBe("2026-12-01");
    expect(late?.progress).toEqual({ done: 2, total: 6, percent: 33 });
    expect(late?.tasks.UP_NEXT.map((task) => task.title)).toEqual([
      "Sooner",
      "Later",
      "Test task",
      "Undated",
    ]);
    expect(late?.tasks.IN_PROGRESS).toEqual([]);
    expect(late?.tasks.DONE).toEqual([
      {
        id: expect.any(String),
        title: "Finished",
        clientStatus: "DONE",
        targetDate: null,
        clientNote: "Shipped",
        completedAt,
      },
      expect.objectContaining({ title: "Old" }),
    ]);
  });

  it("leaves out Milestones with no client-visible Task", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id });
      const shownId = await insertMilestone(tx, {
        clientId: id,
        projectId,
        title: "Shown",
      });
      await insertTask(tx, { clientId: id, projectId, milestoneId: shownId });
      const allHiddenId = await insertMilestone(tx, {
        clientId: id,
        projectId,
        title: "All hidden",
      });
      await insertTask(tx, {
        clientId: id,
        projectId,
        milestoneId: allHiddenId,
        hiddenAt: new Date(),
      });
      await insertMilestone(tx, { clientId: id, projectId, title: "No Tasks" });
    });

    const view = await clientProjects.getProject(clientId, projectId);

    expect(view?.milestones.map((milestone) => milestone.title)).toEqual([
      "Shown",
    ]);
  });

  it("collects Tasks without a Milestone under Other work", async () => {
    let withOtherId = "";
    let withoutOtherId = "";
    const clientId = await seedClient(async (tx, id) => {
      withOtherId = await insertProject(tx, { clientId: id });
      await insertTask(tx, {
        clientId: id,
        projectId: withOtherId,
        title: "Loose",
      });
      withoutOtherId = await insertProject(tx, { clientId: id });
      const milestoneId = await insertMilestone(tx, {
        clientId: id,
        projectId: withoutOtherId,
      });
      await insertTask(tx, {
        clientId: id,
        projectId: withoutOtherId,
        milestoneId,
      });
    });

    const withOther = await clientProjects.getProject(clientId, withOtherId);
    const withoutOther = await clientProjects.getProject(
      clientId,
      withoutOtherId,
    );

    expect(withOther?.otherWork?.UP_NEXT.map((task) => task.title)).toEqual([
      "Loose",
    ]);
    expect(withoutOther?.otherWork).toBeNull();
  });

  it("leaves hidden Tasks out of groups and progress", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id });
      const milestoneId = await insertMilestone(tx, {
        clientId: id,
        projectId,
      });
      await insertTask(tx, { clientId: id, projectId, milestoneId });
      await insertTask(tx, {
        clientId: id,
        projectId,
        milestoneId,
        title: "Internal",
        hiddenAt: new Date(),
      });
      await insertTask(tx, {
        clientId: id,
        projectId,
        title: "Internal loose",
        hiddenAt: new Date(),
      });
    });

    const view = await clientProjects.getProject(clientId, projectId);

    expect(view?.milestones[0].progress.total).toBe(1);
    expect(view?.milestones[0].tasks.UP_NEXT).toHaveLength(1);
    expect(view?.otherWork).toBeNull();
  });

  it("is null for another Client's Project, an unknown id or a non-UUID", async () => {
    let otherProjectId = "";
    await seedClient(async (tx, id) => {
      otherProjectId = await insertProject(tx, { clientId: id });
    });
    const clientId = await seedClient();

    expect(
      await clientProjects.getProject(clientId, otherProjectId),
    ).toBeNull();
    expect(await clientProjects.getProject(clientId, randomUUID())).toBeNull();
    expect(await clientProjects.getProject(clientId, "not-a-uuid")).toBeNull();
  });

  it("marks a Past Project", async () => {
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, {
        clientId: id,
        closedOnGithub: true,
      });
    });

    const view = await clientProjects.getProject(clientId, projectId);

    expect(view?.isPast).toBe(true);
  });
});

describe("without RLS (app-layer backstop)", () => {
  // Every tenant read runs as app_system (BYPASSRLS), so only the module's
  // own client_id and hidden_at filters keep rows out.
  const unguarded = createClientProjects({
    db: { ...db, withTenant: (_clientId, work) => db.withSystem(work) },
  });

  it("still shows only the Client's Projects and visible Tasks", async () => {
    let otherProjectId = "";
    await seedClient(async (tx, id) => {
      otherProjectId = await insertProject(tx, {
        clientId: id,
        name: "Theirs",
      });
      await insertStatusUpdate(tx, { clientId: id, projectId: otherProjectId });
    });
    let projectId = "";
    const clientId = await seedClient(async (tx, id) => {
      projectId = await insertProject(tx, { clientId: id, name: "Mine" });
      const milestoneId = await insertMilestone(tx, {
        clientId: id,
        projectId,
      });
      await insertTask(tx, { clientId: id, projectId, milestoneId });
      await insertTask(tx, {
        clientId: id,
        projectId,
        milestoneId,
        hiddenAt: new Date(),
      });
      await insertTask(tx, {
        clientId: id,
        projectId,
        title: "Internal loose",
        hiddenAt: new Date(),
      });
    });

    const summaries = await unguarded.listProjects(clientId);
    const view = await unguarded.getProject(clientId, projectId);

    expect(summaries.map((summary) => summary.name)).toEqual(["Mine"]);
    expect(summaries[0].taskCounts.UP_NEXT).toBe(1);
    expect(summaries[0].health).toBeNull();
    expect(await unguarded.countActiveProjects(clientId)).toBe(1);
    expect(view?.milestones[0].progress.total).toBe(1);
    expect(view?.otherWork).toBeNull();
    expect(await unguarded.getProject(clientId, otherProjectId)).toBeNull();
  });
});
