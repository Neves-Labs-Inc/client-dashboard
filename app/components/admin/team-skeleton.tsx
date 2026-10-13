import PendingSkeleton from "@/components/team/pending-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

// The Team tab's empty layout in blocks, line box for line box, so nothing
// shifts when the page arrives.
function PanelSkeleton(): React.ReactNode {
  return (
    <div className="rounded-[3px] border border-line bg-surface">
      <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
        <Skeleton className="h-3 w-[20%]" />
      </div>
      <div className="px-3 py-6">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3 w-[30%]" />
        </div>
      </div>
    </div>
  );
}

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
        <div className="border-b border-line">
          <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
        <PanelSkeleton />
        <PendingSkeleton />
      </div>
    </SkeletonGroup>
  );
}
