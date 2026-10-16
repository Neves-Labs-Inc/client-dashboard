import type { RequestStatus as Status } from "@/lib/requests/request-rules";
import { cn } from "@/lib/utils";

export const REQUEST_STATUS_LABEL: Record<Status, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  DONE: "Done",
  WITHDRAWN: "Withdrawn",
};

const GLYPH_SIZE = 12;

// Closed Requests (Declined, Withdrawn) recede; the rest read at full weight.
const COLOR_CLASS: Record<Status, string> = {
  NEW: "text-fg",
  ACCEPTED: "text-fg",
  DONE: "text-fg",
  DECLINED: "text-fg-2",
  WITHDRAWN: "text-fg-2",
};

const STROKE_PATH: Record<Exclude<Status, "NEW">, string> = {
  ACCEPTED: "M2.5 6.2l2.3 2.3 4.7-4.8",
  DONE: "M1 6.3l2 2 4.2-4.6M5.6 8.1l.2.2 4.2-4.6",
  DECLINED: "M3 3l6 6M9 3l-6 6",
  WITHDRAWN: "M2.5 6h7",
};

// The double check needs a lighter stroke to stay legible at 12px.
const DONE_STROKE_WIDTH = 1.4;
const STROKE_WIDTH = 1.6;

function StatusGlyph({ status }: { status: Status }): React.ReactNode {
  return (
    <svg
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="shrink-0"
    >
      {status === "NEW" ? (
        <circle cx="6" cy="6" r="3.5" fill="currentColor" />
      ) : (
        <path
          d={STROKE_PATH[status]}
          fill="none"
          stroke="currentColor"
          strokeWidth={status === "DONE" ? DONE_STROKE_WIDTH : STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

type RequestStatusProps = {
  status: Status;
  className?: string;
};

// Never color alone: the glyph is decorative and the word carries it.
export default function RequestStatus({
  status,
  className,
}: RequestStatusProps): React.ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[13px]/5 whitespace-nowrap tabular-nums",
        COLOR_CLASS[status],
        className,
      )}
    >
      <StatusGlyph status={status} />
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}
