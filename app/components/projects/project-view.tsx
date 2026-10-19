import EarlierUpdatesPanel from "@/components/projects/earlier-updates-panel";
import LatestUpdatePanel from "@/components/projects/latest-update-panel";
import ProjectTasksPanel from "@/components/projects/project-tasks-panel";
import PageHeader from "@/components/ui/page-header";
import TagBadge from "@/components/ui/tag-badge";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { ProjectView as ProjectViewData } from "@/lib/client-projects/client-projects";
import { getHealthTone } from "@/lib/project-health";

type ProjectViewProps = {
  clientName: string;
  project: ProjectViewData;
};

// One Project for its Client: how it's going (the latest Status Update), how
// it got there (earlier ones) and its client-visible Tasks.
export default function ProjectView({
  clientName,
  project,
}: ProjectViewProps): React.ReactNode {
  const { name, isPast, latest, earlier, milestones, otherWork } = project;
  const paths = useClientPaths();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: clientName, isTruncated: true },
          { label: "Projects", href: paths.projects },
        ]}
        title={name}
        badge={isPast && <TagBadge>Past Project</TagBadge>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <LatestUpdatePanel latest={latest} />
          <EarlierUpdatesPanel earlier={earlier} />
        </div>
        <ProjectTasksPanel
          milestones={milestones}
          otherWork={otherWork}
          tone={getHealthTone(latest?.health ?? null)}
        />
      </div>
    </div>
  );
}
