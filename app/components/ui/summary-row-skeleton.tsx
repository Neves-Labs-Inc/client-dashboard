import {
  getSummaryColumnsClass,
  getTileBorderClass,
} from "@/components/ui/summary-grid";
import SummaryTileSkeleton from "@/components/ui/summary-tile-skeleton";

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
          className={`min-w-0 ${getTileBorderClass(index, count)}`}
        >
          <SummaryTileSkeleton />
        </div>
      ))}
    </div>
  );
}
