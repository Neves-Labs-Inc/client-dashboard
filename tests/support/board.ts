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
  unlinkedAt?: Date | null;
  url?: string;
};

type ProjectChildInput = { clientId: string; projectId: string };

type TaskInput = ProjectChildInput & { milestoneId?: string | null };

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
      name: "Test board",
      url: input.url ?? "https://github.com/orgs/test/projects/1",
      unlinkedAt: input.unlinkedAt ?? null,
    })
    .returning({ id: projects.id });
  return row.id;
}

export async function insertStatusUpdate(
  tx: Tx,
  input: ProjectChildInput,
): Promise<string> {
  const [row] = await tx
    .insert(statusUpdates)
    .values({
      ...input,
      githubNodeId: `PVTSU_${randomUUID()}`,
      health: "ON_TRACK",
      githubCreatedAt: new Date(),
    })
    .returning({ id: statusUpdates.id });
  return row.id;
}

export async function insertMilestone(
  tx: Tx,
  input: ProjectChildInput,
): Promise<string> {
  const [row] = await tx
    .insert(milestones)
    .values({ ...input, title: `Milestone ${randomUUID()}` })
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
      title: "Test task",
    })
    .returning({ id: tasks.id });
  return row.id;
}

export async function insertStatusMapping(
  tx: Tx,
  input: ProjectChildInput,
): Promise<string> {
  const [row] = await tx
    .insert(projectStatusMappings)
    .values({
      ...input,
      githubOptionId: randomUUID(),
      optionName: "In review",
      clientStatus: "IN_PROGRESS",
    })
    .returning({ id: projectStatusMappings.id });
  return row.id;
}
