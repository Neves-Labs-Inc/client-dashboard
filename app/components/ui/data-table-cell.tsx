import { cn } from "@/lib/utils";

type DataTableCellProps = {
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
};

// Callers place cells on mobile with grid classes in `className`.
export default function DataTableCell({
  align = "start",
  className,
  children,
}: DataTableCellProps): React.ReactNode {
  return (
    <div
      role="cell"
      className={cn(
        "min-w-0",
        align === "end" && "text-right font-mono tabular-nums",
        className,
      )}
    >
      {children}
    </div>
  );
}
