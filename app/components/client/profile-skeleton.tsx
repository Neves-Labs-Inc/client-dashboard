import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const ROW_CLASS =
  "grid grid-cols-1 gap-0.5 px-3 py-2 md:min-h-10 md:grid-cols-[160px_minmax(0,1fr)] md:items-baseline md:gap-3";

// A panel's header bar, as Panel's.
function PanelBar(): React.ReactNode {
  return (
    <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

function SkeletonRow(): React.ReactNode {
  return (
    <div className={ROW_CLASS}>
      <div className="flex h-[18px] items-center">
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="flex h-5 items-center">
        <Skeleton className="h-3 w-[60%]" />
      </div>
    </div>
  );
}

// The Profile page in blocks, line box for line box, so nothing shifts when
// the page arrives.
export default function ProfileSkeleton(): React.ReactNode {
  return (
    <SkeletonGroup label="profile">
      <div className="flex max-w-2xl flex-col gap-4">
        {/* As PageHeader: breadcrumb line, then the h1. */}
        <div className="min-w-0">
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="rounded-[3px] border border-line bg-surface">
          <PanelBar />
          <div className="flex flex-col gap-4 px-3 py-3">
            <div className="flex flex-col">
              <div className="mb-1.5 flex h-[18px] items-center">
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-11 w-full md:h-9 md:max-w-sm" />
            </div>
            <Skeleton className="h-11 w-[106px] md:h-8 md:w-[91px] pointer-coarse:h-11" />
          </div>
          <div className="divide-y divide-line border-t border-line">
            {Array.from({ length: 3 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </div>
        <div className="rounded-[3px] border border-line bg-surface">
          <PanelBar />
          <div className="divide-y divide-line">
            {Array.from({ length: 2 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </div>
        <div className="rounded-[3px] border border-line bg-surface">
          <PanelBar />
          <div className="px-3 py-3">
            <Skeleton className="h-11 w-36 md:h-8 pointer-coarse:h-11" />
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
