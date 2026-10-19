import OverviewSkeleton from "@/components/client/overview-skeleton";
import ProjectViewSkeleton from "@/components/client/project-view-skeleton";
import ProjectsPageSkeleton from "@/components/projects/projects-page-skeleton";
import RequestDetailSkeleton from "@/components/requests/request-detail-skeleton";
import RequestsPageSkeleton from "@/components/requests/requests-page-skeleton";
import type { ClientPage } from "@/lib/client-paths";

// `isReadOnly`: the Admin preview's, whose pages have no actions to draw.
const SKELETONS: Record<ClientPage, (isReadOnly: boolean) => React.ReactNode> =
  {
    overview: (isReadOnly) => <OverviewSkeleton isReadOnly={isReadOnly} />,
    projects: () => <ProjectsPageSkeleton />,
    project: () => <ProjectViewSkeleton />,
    requests: (isReadOnly) => <RequestsPageSkeleton hasAction={!isReadOnly} />,
    request: (isReadOnly) => (
      <RequestDetailSkeleton actionCount={isReadOnly ? 1 : 2} />
    ),
  };

// The skeleton a client page shows while a client-side navigation loads it
// (the client layout and the preview's share it); null for no such page.
export function getClientPageSkeleton(
  page: ClientPage | null,
  isReadOnly = false,
): React.ReactNode {
  return page === null ? null : SKELETONS[page](isReadOnly);
}
