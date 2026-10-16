import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const PANEL_CLASS = "min-w-0 rounded-[3px] border border-line bg-surface";
const LATEST_LINE_WIDTHS = ["w-full", "w-[95%]", "w-[90%]", "w-[60%]"];
const EARLIER_LINE_WIDTHS = ["w-full", "w-[70%]"];
const EARLIER_ENTRIES = 2;
const TASK_ROWS = 3;

// A panel's header bar, as Panel's: title block, optional meta block.
function PanelBar({ hasMeta = true }: { hasMeta?: boolean }): React.ReactNode {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3 py-2">
      <Skeleton className="h-3 w-24" />
      {hasMeta && <Skeleton className="h-3 w-20" />}
    </div>
  );
}

function TextLines({ widths }: { widths: string[] }): React.ReactNode {
  return (
    <div>
      {widths.map((width) => (
        <div key={width} className="flex h-5 items-center">
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}

function MetaRow({ metaWidth }: { metaWidth: string }): React.ReactNode {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-5 w-16" />
      <Skeleton className={`h-3 ${metaWidth}`} />
    </div>
  );
}

function TaskRowSkeleton(): React.ReactNode {
  return (
    <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-line px-3 py-2 md:grid-cols-[14px_minmax(0,1fr)_auto]">
      <div className="flex h-5 items-center">
        <Skeleton className="size-3.5" />
      </div>
      <div className="flex h-5 items-center">
        <Skeleton className="h-3 w-[60%]" />
      </div>
      <div className="col-start-2 flex h-4 items-center md:col-start-3 md:row-start-1 md:h-5">
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// The Project view in blocks, line box for line box, so nothing shifts when
// the page arrives.
export default function ProjectViewSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="Project">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-[30%]" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-[18px] w-[40%]" />
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <div className={PANEL_CLASS}>
              <PanelBar />
              <div className="flex flex-col gap-3 px-3 py-3">
                <MetaRow metaWidth="w-32" />
                <TextLines widths={LATEST_LINE_WIDTHS} />
              </div>
            </div>
            <div className={PANEL_CLASS}>
              <PanelBar />
              <div className="flex flex-col gap-5 px-3 py-3">
                {Array.from({ length: EARLIER_ENTRIES }, (_, index) => (
                  <div key={index} className="relative pl-5">
                    <div className="absolute top-2 -bottom-5 left-1 w-px -translate-x-1/2 bg-line" />
                    <div className="flex h-4 items-center">
                      <Skeleton className="h-3 w-14" />
                    </div>
                    <div className="mt-1.5">
                      <MetaRow metaWidth="w-28" />
                    </div>
                    <div className="mt-2">
                      <TextLines widths={EARLIER_LINE_WIDTHS} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={PANEL_CLASS}>
            <PanelBar hasMeta={false} />
            <div className="pb-1">
              <div className="px-3 pt-3 pb-2">
                <div className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-[45%]" />
                </div>
                <div className="flex h-4 items-center justify-between gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="mt-1.5 h-1 w-full rounded-[1px] bg-surface-3" />
              </div>
              <div className="box-content flex h-4 items-center px-3 pt-3 pb-1.5">
                <Skeleton className="h-3 w-20" />
              </div>
              {Array.from({ length: TASK_ROWS }, (_, index) => (
                <TaskRowSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
