import Skeleton from "@/components/ui/skeleton";

// One SummaryTile in blocks, line box for line box.
export default function SummaryTileSkeleton(): React.ReactNode {
  return (
    <div className="px-3 py-2.5">
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="mt-0.5 flex h-7 items-center">
        <Skeleton className="h-5 w-[40%]" />
      </div>
    </div>
  );
}
