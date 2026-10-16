import TaskGroupSection from "@/components/projects/task-group-section";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import type { Status } from "@/components/ui/status-icon";
import type {
  ClientTaskGroups,
  MilestoneView,
} from "@/lib/client-projects/client-projects";

type ProjectTasksPanelProps = {
  milestones: MilestoneView[];
  otherWork: ClientTaskGroups | null;
  // The Project's health tone, for every Milestone's progress bar.
  tone: Status;
};

export default function ProjectTasksPanel({
  milestones,
  otherWork,
  tone,
}: ProjectTasksPanelProps): React.ReactNode {
  const hasTasks = milestones.length > 0 || otherWork !== null;

  return (
    <Panel title="Tasks">
      {hasTasks ? (
        <>
          {milestones.map((milestone) => (
            <TaskGroupSection
              key={milestone.id}
              title={milestone.title}
              tasks={milestone.tasks}
              milestone={{
                dueDate: milestone.dueDate,
                progress: milestone.progress,
                tone,
              }}
            />
          ))}
          {otherWork !== null && (
            <TaskGroupSection title="Other work" tasks={otherWork} />
          )}
        </>
      ) : (
        <EmptyState>No Tasks yet.</EmptyState>
      )}
    </Panel>
  );
}
