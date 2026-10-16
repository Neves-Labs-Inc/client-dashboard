import Skeleton from "@/components/ui/skeleton";
import {
  getSummaryColumnsClass,
  getTileBorderClass,
} from "@/components/ui/summary-grid";

type SummaryRowSkeletonProps = {
  count: number;
};

// The real strip with placeholder tiles, line box for line box.
export default function SummaryRowSkeleton({
  count,
}: SummaryRowSkeletonProps): React.ReactNode {
  return (
    <div
      className={`grid overflow-hidden rounded-[3px] border border-line bg-surface ${getSummaryColumnsClass(count)}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`min-w-0 px-3 py-2.5 ${getTileBorderClass(index, count)}`}
        >
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="mt-0.5 flex h-7 items-center">
            <Skeleton className="h-5 w-[40%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
