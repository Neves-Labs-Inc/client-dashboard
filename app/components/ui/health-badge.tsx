import StatusIcon, { type Status } from "@/components/ui/status-icon";
import type { Health } from "@/lib/client-projects/client-project-rules";
import { HEALTH_LABEL, HEALTH_TONE } from "@/lib/project-health";

type HealthBadgeProps = {
  // Callers render nothing when a Project has no health.
  health: Health;
};

// A literal map, so Tailwind sees every class.
const TONE_CLASS: Record<Status, string> = {
  ok: "border-ok bg-ok-subtle text-ok",
  risk: "border-risk bg-risk-subtle text-risk",
  off: "border-off bg-off-subtle text-off",
  done: "border-done bg-done-subtle text-done",
  idle: "border-idle bg-idle-subtle text-idle",
};

export default function HealthBadge({
  health,
}: HealthBadgeProps): React.ReactNode {
  const tone = HEALTH_TONE[health];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 text-xs/4 font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      <StatusIcon status={tone} size={12} />
      {HEALTH_LABEL[health]}
    </span>
  );
}
