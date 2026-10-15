import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const ROW_COUNT = 3;

// Three option rows on ColumnMappingList's grid, so nothing shifts when the
// options arrive.
export default function ColumnMappingSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="columns">
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: ROW_COUNT }, (_, index) => (
          <div
            key={index}
            className="grid min-h-11 grid-cols-[minmax(0,1fr)_160px] items-center gap-3 md:min-h-9"
          >
            <Skeleton className="h-3 w-[45%]" />
            <Skeleton className="h-11 w-40 md:h-9 pointer-coarse:h-11" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
