import PendingSkeleton from "@/components/team/pending-skeleton";
import UsersSkeleton from "@/components/team/users-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

type ClientTeamSkeletonProps = {
  // Owners' page also has the invite action and the Pending invitations
  // panel; a Member's has neither.
  isOwner: boolean;
};

// The client Team page in blocks, line box for line box, so nothing shifts
// when the page arrives.
export default function ClientTeamSkeleton({
  isOwner,
}: ClientTeamSkeletonProps): React.ReactNode {
  return (
    <SkeletonGroup label="team">
      <div className="flex flex-col gap-4">
        {/* As PageHeader: the action under the h1, bottom-right from md. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 md:flex-1">
            <div className="flex h-4 items-center">
              <Skeleton className="h-3 w-[30%]" />
            </div>
            <div className="mt-1 flex h-6 items-center">
              <Skeleton className="h-[18px] w-[20%]" />
            </div>
          </div>
          {isOwner && (
            <Skeleton className="h-11 w-[160px] shrink-0 md:h-8 md:w-[140px] pointer-coarse:h-11" />
          )}
        </div>
        <UsersSkeleton hasActions={isOwner} />
        {isOwner && <PendingSkeleton />}
      </div>
    </SkeletonGroup>
  );
}
