import { formatDate, formatIsoDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type DateTextProps = {
  date: Date | string;
  className?: string;
};

// Size and color inherit from the caller.
export default function DateText({
  date,
  className,
}: DateTextProps): React.ReactNode {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  return (
    <time
      dateTime={formatIsoDate(parsed)}
      className={cn("font-mono tabular-nums", className)}
    >
      {formatDate(parsed)}
    </time>
  );
}
