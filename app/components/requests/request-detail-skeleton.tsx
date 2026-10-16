import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const PANEL_CLASS = "min-w-0 rounded-[3px] border border-line bg-surface";
const DETAIL_ROWS = 5;
const DESCRIPTION_LINE_WIDTHS = ["w-full", "w-[90%]", "w-[60%]"];

function PanelBar(): React.ReactNode {
  return (
    <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

// A Request's detail in blocks, on the real view's grid, so nothing shifts
// when the page arrives.
export default function RequestDetailSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Request">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex h-4 items-center">
              <Skeleton className="h-3 w-[30%]" />
            </div>
            <div className="mt-1 flex h-6 items-center">
              <Skeleton className="h-[18px] w-[60%]" />
            </div>
            <div className="flex h-6 items-center">
              <Skeleton className="h-[18px] w-[40%]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-11 w-28 md:h-8 md:w-24" />
            <Skeleton className="h-11 w-32 md:h-8 md:w-28" />
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
          <div className={`${PANEL_CLASS} xl:col-start-2 xl:row-start-1`}>
            <PanelBar />
            <div className="divide-y divide-line">
              {Array.from({ length: DETAIL_ROWS }, (_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-0.5 px-3 py-2 md:min-h-10 md:grid-cols-[160px_minmax(0,1fr)] md:items-center md:gap-3"
                >
                  <div className="flex h-[18px] items-center">
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex h-5 items-center">
                    <Skeleton className="h-3 w-[40%]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`${PANEL_CLASS} xl:col-start-1 xl:row-start-1`}>
            <PanelBar />
            <div className="px-3 py-3">
              {DESCRIPTION_LINE_WIDTHS.map((width) => (
                <div key={width} className="flex h-5 items-center">
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
