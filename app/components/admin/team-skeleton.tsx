import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import PendingSkeleton from "@/components/team/pending-skeleton";
import UsersSkeleton from "@/components/team/users-skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Team tab in blocks, line box for line box, so nothing shifts when the
// page arrives. Clients with users are the common case: the Users panel shows
// rows, each with its two buttons.
export default function TeamSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="team">
      <div className="flex flex-col gap-4">
        <WorkspaceHeaderSkeleton />
        <UsersSkeleton hasActions />
        <PendingSkeleton />
      </div>
    </SkeletonGroup>
  );
}
