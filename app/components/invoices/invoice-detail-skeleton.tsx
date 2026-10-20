import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import { cn } from "@/lib/utils";

const PANEL_CLASS = "min-w-0 rounded-[3px] border border-line bg-surface";
const FACT_ROWS = 3;
const LINE_ITEM_ROWS = 3;
const LINE_ITEM_GRID_CLASS = "grid grid-cols-[minmax(0,1fr)_8rem] gap-x-3";

function PanelBar(): React.ReactNode {
  return (
    <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

// One Line Items row: the real rows' padding and line boxes.
function LineItemRow({
  className,
  descriptionWidth,
}: {
  className?: string;
  descriptionWidth: string;
}): React.ReactNode {
  return (
    <div
      className={cn(
        LINE_ITEM_GRID_CLASS,
        "min-h-11 border-t border-line px-3 py-2 first:border-t-0 md:min-h-10 md:items-center md:first:border-t pointer-coarse:min-h-11",
        className,
      )}
    >
      <div className="flex h-5 items-center">
        <Skeleton className={cn("h-3", descriptionWidth)} />
      </div>
      <div className="flex h-5 items-center justify-end">
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

// An Invoice's detail in blocks, on the real view's grid, so nothing shifts
// when the page arrives. The Memo panel isn't drawn: not every Invoice has
// one.
export default function InvoiceDetailSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Invoice">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex h-4 items-center">
              <Skeleton className="h-3 w-[30%]" />
            </div>
            <div className="mt-1 flex h-6 items-center gap-1.5">
              <Skeleton className="h-[18px] w-32" />
              <Skeleton className="h-[22px] w-16 rounded-[3px]" />
            </div>
          </div>
          <Skeleton className="h-11 w-28 md:h-8 md:w-24" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
          <div className={cn(PANEL_CLASS, "xl:col-start-2 xl:row-start-1")}>
            <PanelBar />
            <div className="divide-y divide-line">
              {Array.from({ length: FACT_ROWS }, (_, index) => (
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
          <div
            className={cn(
              PANEL_CLASS,
              "xl:col-start-1 xl:row-span-2 xl:row-start-1",
            )}
          >
            <PanelBar />
            <div
              className={cn(
                "hidden bg-surface-2 px-3 py-1.5 md:grid",
                LINE_ITEM_GRID_CLASS,
              )}
            >
              <div className="flex h-4 items-center">
                <Skeleton className="h-2.5 w-20" />
              </div>
              <div className="flex h-4 items-center justify-end">
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
            <div>
              {Array.from({ length: LINE_ITEM_ROWS }, (_, index) => (
                <LineItemRow key={index} descriptionWidth="w-[60%]" />
              ))}
              <LineItemRow className="bg-surface-2" descriptionWidth="w-10" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
