import AdminRequestsSkeleton from "@/components/admin/admin-requests-skeleton";
import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Requests tab in blocks, so nothing shifts when the page arrives.
export default function ClientRequestsSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Requests">
      <div className="flex flex-col gap-4">
        <WorkspaceHeaderSkeleton />
        <AdminRequestsSkeleton variant="client" />
      </div>
    </SkeletonGroup>
  );
}
