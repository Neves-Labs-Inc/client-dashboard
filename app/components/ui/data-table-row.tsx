import { cn } from "@/lib/utils";

type DataTableRowProps = {
  gridClassName: string;
  isLink?: boolean;
  isHighlighted?: boolean;
  children: React.ReactNode;
};

// A linking row's title cell holds an <a> with `after:absolute after:inset-0`,
// so the whole row is the hit area and the row draws the focus ring.
export default function DataTableRow({
  gridClassName,
  isLink = false,
  isHighlighted = false,
  children,
}: DataTableRowProps): React.ReactNode {
  return (
    <div
      role="row"
      className={cn(
        // first:border-t-0 avoids a double hairline under the panel header
        // while the table header is sr-only.
        "grid min-h-11 gap-3 border-t border-line px-3 py-2 first:border-t-0 md:min-h-10 md:items-center md:first:border-t pointer-coarse:min-h-11",
        gridClassName,
        isLink &&
          "relative transition-[color,background-color,border-color] duration-(--dur-instant) hover:bg-surface-2 active:bg-surface-3 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-accent",
        isHighlighted && "animate-row-highlight",
      )}
    >
      {children}
    </div>
  );
}
