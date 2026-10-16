import { Suspense, useRef } from "react";
import { Await } from "react-router";
import ProjectTable from "@/components/projects/project-table";
import ProjectTableSkeleton from "@/components/projects/project-table-skeleton";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import SkeletonGroup from "@/components/ui/skeleton-group";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";

type ProjectsPanelProps = {
  // Null when the Projects couldn't load.
  projects: Promise<ProjectSummary[] | null>;
  // Makes the panel title a link (the Overview's panel).
  titleHref?: string;
};

function getMeta(projects: ProjectSummary[]): string | undefined {
  if (projects.length === 0) return undefined;

  const pastCount = projects.filter((project) => project.isPast).length;
  const activeCount = projects.length - pastCount;
  return pastCount === 0
    ? `${activeCount} active`
    : `${activeCount} active · ${pastCount} past`;
}

export default function ProjectsPanel({
  projects,
  titleHref,
}: ProjectsPanelProps): React.ReactNode {
  // Focused after a successful retry: the error's "Try again" goes away.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const error = (
    <Panel title="Projects" titleHref={titleHref} titleRef={titleRef}>
      <PanelError
        message="Couldn't load Projects."
        getReturnFocusTarget={() => titleRef.current}
      />
    </Panel>
  );

  return (
    <Suspense fallback={<ProjectsPanelLoading titleHref={titleHref} />}>
      <Await resolve={projects} errorElement={error}>
        {(resolved) =>
          resolved === null ? (
            error
          ) : (
            <Panel
              title="Projects"
              titleHref={titleHref}
              titleRef={titleRef}
              meta={getMeta(resolved)}
            >
              {resolved.length === 0 ? (
                <EmptyState>
                  No Projects yet. They appear here once Neves Labs starts work.
                </EmptyState>
              ) : (
                <ProjectTable projects={resolved} />
              )}
            </Panel>
          )
        }
      </Await>
    </Suspense>
  );
}

function ProjectsPanelLoading({
  titleHref,
}: {
  titleHref?: string;
}): React.ReactNode {
  return (
    <Panel title="Projects" titleHref={titleHref}>
      <SkeletonGroup label="Projects">
        <ProjectTableSkeleton />
      </SkeletonGroup>
    </Panel>
  );
}
