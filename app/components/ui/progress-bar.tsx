import type { Status } from "@/components/ui/status-icon";
import { cn } from "@/lib/utils";

type ProgressBarProps = {
  percent: number;
  tone: Status;
  // E.g. "Pricing page progress".
  label: string;
  className?: string;
};

const MAX_PERCENT = 100;

// A literal map, so Tailwind sees every class.
const FILL_CLASS: Record<Status, string> = {
  ok: "bg-ok",
  risk: "bg-risk",
  off: "bg-off",
  done: "bg-done",
  idle: "bg-idle",
};

// The bar only: callers put the name and the % around it.
export default function ProgressBar({
  percent,
  tone,
  label,
  className,
}: ProgressBarProps): React.ReactNode {
  const value = Math.round(Math.min(MAX_PERCENT, Math.max(0, percent)));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={MAX_PERCENT}
      aria-valuenow={value}
      aria-label={label}
      className={cn(
        "h-1 w-full overflow-hidden rounded-[1px] bg-surface-3",
        className,
      )}
    >
      {/* The value goes through a variable, never an inline transform: that
          would beat @starting-style and kill the mount animation. */}
      <div
        className={cn(
          "h-full w-full origin-left [transform:scaleX(var(--progress))] transition-transform duration-(--dur-progress) ease-(--ease-out) motion-reduce:transition-none starting:[transform:scaleX(0)]",
          FILL_CLASS[tone],
        )}
        style={{ "--progress": value / MAX_PERCENT } as React.CSSProperties}
      />
    </div>
  );
}
