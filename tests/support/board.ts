import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db/db";
import {
  milestones,
  projects,
  projectStatusMappings,
  statusUpdates,
  tasks,
} from "@/lib/db/schema";

// Inserts for the board mirror tables. Node ids are random so seeds never
// collide on the global unique indexes.

type ProjectInput = {
  clientId: string;
  githubProjectNodeId?: string;
  name?: string;
  closedOnGithub?: boolean;
  unlinkedAt?: Date | null;
  url?: string;
};

type ProjectChildInput = { clientId: string; projectId: string };

type StatusUpdateInput = ProjectChildInput & {
  health?: typeof statusUpdates.$inferInsert.health;
  body?: string;
  startDate?: string | null;
  targetDate?: string | null;
  githubCreatedAt?: Date;
};

type MilestoneInput = ProjectChildInput & {
  title?: string;
  dueDate?: string | null;
};

type TaskInput = ProjectChildInput & {
  milestoneId?: string | null;
  hiddenAt?: Date | null;
  title?: string;
  statusOptionId?: string | null;
  targetDate?: string | null;
  completedAt?: Date | null;
  clientNote?: string | null;
};

type StatusMappingInput = ProjectChildInput & {
  githubOptionId?: string;
  clientStatus?: typeof projectStatusMappings.$inferInsert.clientStatus;
};

export async function insertProject(
  tx: Tx,
  input: ProjectInput,
): Promise<string> {
  const [row] = await tx
    .insert(projects)
    .values({
      clientId: input.clientId,
      githubProjectNodeId: input.githubProjectNodeId ?? `PVT_${randomUUID()}`,
      githubProjectNumber: 1,
      name: input.name ?? "Test board",
      closedOnGithub: input.closedOnGithub ?? false,
      url: input.url ?? "https://github.com/orgs/test/projects/1",
      unlinkedAt: input.unlinkedAt ?? null,
    })
    .returning({ id: projects.id });
  return row.id;
}

export async function insertStatusUpdate(
  tx: Tx,
  input: StatusUpdateInput,
): Promise<string> {
  const [row] = await tx
    .insert(statusUpdates)
    .values({
      health: "ON_TRACK",
      githubCreatedAt: new Date(),
      ...input,
      githubNodeId: `PVTSU_${randomUUID()}`,
    })
    .returning({ id: statusUpdates.id });
  return row.id;
}

export async function insertMilestone(
  tx: Tx,
  input: MilestoneInput,
): Promise<string> {
  const [row] = await tx
    .insert(milestones)
    .values({ title: `Milestone ${randomUUID()}`, ...input })
    .returning({ id: milestones.id });
  return row.id;
}

export async function insertTask(tx: Tx, input: TaskInput): Promise<string> {
  const [row] = await tx
    .insert(tasks)
    .values({
      clientId: input.clientId,
      projectId: input.projectId,
      milestoneId: input.milestoneId ?? null,
      githubItemNodeId: `PVTI_${randomUUID()}`,
      githubIssueNodeId: `I_${randomUUID()}`,
      githubRepositoryNodeId: `R_${randomUUID()}`,
      title: input.title ?? "Test task",
      hiddenAt: input.hiddenAt ?? null,
      statusOptionId: input.statusOptionId ?? null,
      targetDate: input.targetDate ?? null,
      completedAt: input.completedAt ?? null,
      clientNote: input.clientNote ?? null,
    })
    .returning({ id: tasks.id });
  return row.id;
}

export async function insertStatusMapping(
  tx: Tx,
  input: StatusMappingInput,
): Promise<string> {
  const [row] = await tx
    .insert(projectStatusMappings)
    .values({
      githubOptionId: randomUUID(),
      clientStatus: "IN_PROGRESS",
      ...input,
      optionName: "In review",
    })
    .returning({ id: projectStatusMappings.id });
  return row.id;
}
