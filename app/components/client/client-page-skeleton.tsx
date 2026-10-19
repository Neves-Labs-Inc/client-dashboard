import OverviewSkeleton from "@/components/client/overview-skeleton";
import ProjectViewSkeleton from "@/components/client/project-view-skeleton";
import ProjectsPageSkeleton from "@/components/projects/projects-page-skeleton";
import RequestDetailSkeleton from "@/components/requests/request-detail-skeleton";
import RequestsPageSkeleton from "@/components/requests/requests-page-skeleton";
import type { ClientPage } from "@/lib/client-paths";

const SKELETONS: Record<ClientPage, () => React.ReactNode> = {
  overview: () => <OverviewSkeleton />,
  projects: () => <ProjectsPageSkeleton />,
  project: () => <ProjectViewSkeleton />,
  requests: () => <RequestsPageSkeleton />,
  request: () => <RequestDetailSkeleton />,
};

// The skeleton a client page shows while a client-side navigation loads it
// (the client layout and the preview's share it); null for no such page.
export function getClientPageSkeleton(
  page: ClientPage | null,
): React.ReactNode {
  return page === null ? null : SKELETONS[page]();
}
