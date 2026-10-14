import { formatDate, formatDateTime, formatIsoDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type DateTextProps = {
  date: Date | string;
  // "Oct 14, 3:42 PM" instead of "Oct 14".
  withTime?: boolean;
  className?: string;
};

// Size and color inherit from the caller.
export default function DateText({
  date,
  withTime = false,
  className,
}: DateTextProps): React.ReactNode {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  return (
    <time
      dateTime={withTime ? parsed.toISOString() : formatIsoDate(parsed)}
      className={cn("font-mono tabular-nums", className)}
    >
      {withTime ? formatDateTime(parsed) : formatDate(parsed)}
    </time>
  );
}
