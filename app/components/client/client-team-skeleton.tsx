import {
  ROW_GRID_CLASS,
  TABLE_GRID_CLASS,
} from "@/components/admin/team-members-panel";
import PendingSkeleton from "@/components/team/pending-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import { cn } from "@/lib/utils";

const ROW_COUNT = 3;
const CELL_CLASS = "flex h-5 items-center md:col-auto md:row-auto";

// A Users row shaped like TeamMembersPanel's: name over email with the role
// on the right below md, one line from md.
function RowSkeleton(): React.ReactNode {
  return (
    <div
      className={cn(
        "grid min-h-11 gap-3 border-t border-line px-3 py-2 first:border-t-0 md:min-h-10 md:items-center md:first:border-t pointer-coarse:min-h-11",
        ROW_GRID_CLASS,
      )}
    >
      <div className={cn(CELL_CLASS, "col-start-1 row-start-1")}>
        <Skeleton className="h-3 w-[45%] md:w-[60%]" />
      </div>
      <div className={cn(CELL_CLASS, "col-start-1 row-start-2")}>
        <Skeleton className="h-3 w-[65%] md:w-[70%]" />
      </div>
      <div
        className={cn(
          CELL_CLASS,
          "col-start-2 row-span-2 row-start-1 self-start md:self-auto",
        )}
      >
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

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
        <div className="rounded-[3px] border border-line bg-surface">
          <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
            <Skeleton className="h-3 w-12" />
          </div>
          {/* The table header row is sr-only below md, as in DataTable. */}
          <div
            className={cn(
              "hidden gap-3 bg-surface-2 px-3 py-1.5 md:grid",
              TABLE_GRID_CLASS,
            )}
          >
            {["name", "email", "role"].map((column) => (
              <div key={column} className="flex h-4 items-center">
                <Skeleton className="h-2.5 w-12" />
              </div>
            ))}
          </div>
          <div>
            {Array.from({ length: ROW_COUNT }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </div>
        </div>
        {isOwner && <PendingSkeleton />}
      </div>
    </SkeletonGroup>
  );
}
