import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import { cn } from "@/lib/utils";

const FACT_ROW_COUNT = 4;
const LINE_ROW_COUNT = 3;
const ACTION_COUNT = 2;

// A box with a text line's height, so blocks sit where the text will.
function Line({
  className = "h-5",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return <div className={cn("flex items-center", className)}>{children}</div>;
}

function PanelFrame({
  titleClassName,
  className,
  children,
}: {
  titleClassName: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[3px] border border-line bg-surface",
        className,
      )}
    >
      <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
        <Skeleton className={cn("h-3", titleClassName)} />
      </div>
      {children}
    </div>
  );
}

// The Invoice detail in blocks, line box for line box, so nothing shifts
// when the page arrives.
export default function AdminInvoiceDetailSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Invoice">
      <div className="flex flex-col gap-4">
        <WorkspaceHeaderSkeleton />
        <div className="flex flex-col gap-1">
          <Line className="h-11 md:h-5 pointer-coarse:h-11">
            <Skeleton className="h-3 w-20" />
          </Line>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Line className="gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-[22px] w-16 rounded-[3px]" />
            </Line>
            {/* The status buttons, so the row doesn't push content down. */}
            <div className="flex gap-2">
              {Array.from({ length: ACTION_COUNT }, (_, index) => (
                <Skeleton
                  key={index}
                  className="h-11 w-24 rounded-[3px] md:h-8 pointer-coarse:h-11"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
          <PanelFrame
            titleClassName="w-14"
            className="xl:col-start-2 xl:row-start-1"
          >
            <div className="divide-y divide-line">
              {Array.from({ length: FACT_ROW_COUNT }, (_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-0.5 px-3 py-2 md:min-h-10 md:grid-cols-[160px_minmax(0,1fr)] md:items-center md:gap-3"
                >
                  <Line className="h-[18px]">
                    <Skeleton className="h-3 w-14" />
                  </Line>
                  <Line>
                    <Skeleton className="h-3 w-20" />
                  </Line>
                </div>
              ))}
            </div>
          </PanelFrame>
          <PanelFrame
            titleClassName="w-20"
            className="xl:col-start-1 xl:row-span-2 xl:row-start-1"
          >
            <div className="hidden grid-cols-[minmax(0,1fr)_8rem] gap-x-3 bg-surface-2 px-3 py-1.5 md:grid">
              <Line className="h-4">
                <Skeleton className="h-2.5 w-20" />
              </Line>
              <Line className="h-4 justify-end">
                <Skeleton className="h-2.5 w-12" />
              </Line>
            </div>
            {/* Its own group, so the first row drops its top hairline below
                md, as the real table's does. */}
            <div>
              {Array.from({ length: LINE_ROW_COUNT + 1 }, (_, index) => (
                <div
                  key={index}
                  className={cn(
                    "grid min-h-11 grid-cols-[minmax(0,1fr)_8rem] gap-x-3 border-t border-line px-3 py-2 first:border-t-0 md:min-h-10 md:first:border-t pointer-coarse:min-h-11",
                    index === LINE_ROW_COUNT && "bg-surface-2",
                  )}
                >
                  <Line>
                    <Skeleton
                      className={cn(
                        "h-3",
                        index === LINE_ROW_COUNT ? "w-10" : "w-[60%]",
                      )}
                    />
                  </Line>
                  <Line className="justify-end">
                    <Skeleton className="h-3 w-16" />
                  </Line>
                </div>
              ))}
            </div>
          </PanelFrame>
        </div>
      </div>
    </SkeletonGroup>
  );
}
