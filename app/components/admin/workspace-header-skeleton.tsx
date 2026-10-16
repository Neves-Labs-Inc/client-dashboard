import Skeleton from "@/components/ui/skeleton";

// ClientWorkspaceHeader in blocks: breadcrumb, h1, then the tabs.
export default function WorkspaceHeaderSkeleton(): React.ReactNode {
  return (
    <>
      <div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-[30%]" />
        </div>
        <div className="mt-1 flex h-6 items-center">
          <Skeleton className="h-[18px] w-[40%]" />
        </div>
      </div>
      {/* Border outside the row's height, as on TabNav's nav. */}
      <div className="flex border-b border-line">
        <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </>
  );
}
