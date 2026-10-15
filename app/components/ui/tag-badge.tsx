import { cn } from "@/lib/utils";

type TagBadgeProps = {
  children: React.ReactNode;
  // Fades in when the state has just changed; on a page load it's simply
  // there.
  isAnimated?: boolean;
};

// The §2.3 "Open" badge colors, in mono uppercase (Archived, Closed).
export default function TagBadge({
  children,
  isAnimated = false,
}: TagBadgeProps): React.ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border border-fg-2 bg-surface-2 px-1.5 py-0.5 align-middle font-mono text-xs/4 font-medium whitespace-nowrap text-fg-2 uppercase",
        isAnimated &&
          "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 motion-reduce:duration-(--dur-instant)",
      )}
    >
      {children}
    </span>
  );
}
