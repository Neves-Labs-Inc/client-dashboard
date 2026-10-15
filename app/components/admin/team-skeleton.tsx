import PendingSkeleton from "@/components/team/pending-skeleton";
import UsersSkeleton from "@/components/team/users-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Team tab in blocks, line box for line box, so nothing shifts when the
// page arrives. Clients with users are the common case: the Users panel shows
// rows, each with its two buttons.
export default function TeamSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="team">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-[30%]" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-[18px] w-[40%]" />
          </div>
        </div>
        {/* Border outside the row's height, as on TabNav's nav. */}
        <div className="flex border-b border-line">
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
        <UsersSkeleton hasActions />
        <PendingSkeleton />
      </div>
    </SkeletonGroup>
  );
}
