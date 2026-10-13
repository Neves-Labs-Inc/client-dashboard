import { cn } from "@/lib/utils";

type Status = "ok" | "risk" | "off" | "done" | "idle";

type StatusIconProps = {
  status: Status;
  size?: 12 | 14 | 16;
  className?: string;
};

const INNER_STROKE = "var(--color-bg)";

// Shapes differ per status, so health never relies on color alone.
const SHAPES: Record<Status, React.ReactNode> = {
  ok: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M4.5 8.2l2.3 2.3 4.7-4.8"
        stroke={INNER_STROKE}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  risk: (
    <>
      <path d="M8 1.2L15.2 14.5H.8z" fill="currentColor" />
      <path
        d="M8 6v4"
        stroke={INNER_STROKE}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8" cy="12.2" r="1" fill={INNER_STROKE} />
    </>
  ),
  off: (
    <>
      <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
      <path
        d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
        stroke={INNER_STROKE}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  ),
  done: (
    <>
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 8.2l2.3 2.3 4.7-4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  idle: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="3 2.2"
      />
      <path
        d="M5 8h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  ),
};

const COLOR_CLASS: Record<Status, string> = {
  ok: "text-ok",
  risk: "text-risk",
  off: "text-off",
  done: "text-done",
  idle: "text-idle",
};

export default function StatusIcon({
  status,
  size = 12,
  className,
}: StatusIconProps): React.ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0", COLOR_CLASS[status], className)}
    >
      {SHAPES[status]}
    </svg>
  );
}
