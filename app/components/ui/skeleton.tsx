import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

// One block; the caller sizes it (text lines h-3 / h-2.5).
export default function Skeleton({
  className,
}: SkeletonProps): React.ReactNode {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-skeleton-pulse rounded-[3px] bg-surface-3 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
