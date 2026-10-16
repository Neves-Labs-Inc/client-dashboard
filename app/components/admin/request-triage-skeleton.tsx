import WorkspaceHeaderSkeleton from "@/components/admin/workspace-header-skeleton";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";
import { cn } from "@/lib/utils";

const FACT_ROW_COUNT = 6;
const FIELD_COUNT = 2;
const DESCRIPTION_LINE_WIDTHS = ["w-full", "w-[90%]", "w-[60%]"];

type RequestTriageSkeletonProps = {
  route: "inbox" | "client";
};

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
  children,
}: {
  titleClassName: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="min-w-0 rounded-[3px] border border-line bg-surface">
      <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
        <Skeleton className={cn("h-3", titleClassName)} />
      </div>
      {children}
    </div>
  );
}

// The triage detail in blocks, line box for line box, so nothing shifts
// when the page arrives.
export default function RequestTriageSkeleton({
  route,
}: RequestTriageSkeletonProps): React.ReactNode {
  const isInbox = route === "inbox";
  const backLink = (
    <Line className="h-11 md:h-5 pointer-coarse:h-11">
      <Skeleton className="h-3 w-28" />
    </Line>
  );

  return (
    <SkeletonGroup label="Request">
      <div className="flex flex-col gap-4">
        {isInbox ? (
          <>
            {backLink}
            <div>
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-[20%]" />
              </div>
              <div className="mt-1 flex h-6 items-center">
                <Skeleton className="h-[18px] w-[50%]" />
              </div>
            </div>
          </>
        ) : (
          <>
            <WorkspaceHeaderSkeleton />
            <div className="flex flex-col gap-1">
              {backLink}
              <Line>
                <Skeleton className="h-3.5 w-[50%]" />
              </Line>
            </div>
          </>
        )}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <PanelFrame titleClassName="w-16">
            {/* Wrapped, so the first row is :first-child and drops its
                border under the header. */}
            <div>
              {Array.from({ length: FACT_ROW_COUNT }, (_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 border-t border-line px-3 py-2 first:border-t-0"
                >
                  <Line>
                    <Skeleton className="h-3 w-16" />
                  </Line>
                  <Line>
                    <Skeleton className="h-3 w-32" />
                  </Line>
                </div>
              ))}
            </div>
            <div className="border-t border-line px-3 py-3">
              <Line className="mb-1.5 h-4">
                <Skeleton className="h-3 w-20" />
              </Line>
              {DESCRIPTION_LINE_WIDTHS.map((width) => (
                <Line key={width}>
                  <Skeleton className={cn("h-3", width)} />
                </Line>
              ))}
            </div>
          </PanelFrame>
          <PanelFrame titleClassName="w-14">
            <div className="flex flex-col gap-4 p-3">
              {Array.from({ length: FIELD_COUNT }, (_, index) => (
                <div key={index} className="flex flex-col">
                  <Line className="mb-1.5 h-[18px]">
                    <Skeleton className="h-3 w-14" />
                  </Line>
                  <Skeleton className="h-11 w-full md:h-9 pointer-coarse:h-11" />
                </div>
              ))}
              <Skeleton className="h-24 w-full" />
              <div className="flex justify-end">
                <Skeleton className="h-11 w-16 md:h-8 pointer-coarse:h-11" />
              </div>
            </div>
          </PanelFrame>
        </div>
      </div>
    </SkeletonGroup>
  );
}
