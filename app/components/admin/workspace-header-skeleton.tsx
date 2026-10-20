import Skeleton from "@/components/ui/skeleton";

// ClientWorkspaceHeader in blocks: breadcrumb, h1, the action row below md, then the tabs.
export default function WorkspaceHeaderSkeleton(): React.ReactNode {
  return (
    <>
      {/* Mirrors PageHeader's column below md; the row is hidden from md up, so it adds no gap there. */}
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-[30%]" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-[18px] w-[40%]" />
          </div>
        </div>
        {/* Preview + Archive client, both h-11 below md. */}
        <div className="flex gap-2 md:hidden">
          <Skeleton className="h-11 w-26" />
          <Skeleton className="h-11 w-35" />
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
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="flex h-11 items-center px-3 md:h-9 pointer-coarse:h-11">
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </>
  );
}
