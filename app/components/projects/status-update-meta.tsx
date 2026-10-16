import DateText from "@/components/ui/date-text";
import HealthBadge from "@/components/ui/health-badge";
import type { Health } from "@/lib/client-projects/client-project-rules";
import { parseDateOnly } from "@/lib/format-date";

type StatusUpdateMetaProps = {
  health: Health | null;
  startDate: string | null;
  targetDate: string | null;
};

// A Status Update's health and dates; each part is omitted when unset.
export default function StatusUpdateMeta({
  health,
  startDate,
  targetDate,
}: StatusUpdateMetaProps): React.ReactNode {
  if (health === null && startDate === null && targetDate === null) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs/4 text-fg-2">
      {health !== null && <HealthBadge health={health} />}
      {startDate !== null && (
        <span>
          Started <DateText date={parseDateOnly(startDate)} />
        </span>
      )}
      {targetDate !== null && (
        <span>
          Target <DateText date={parseDateOnly(targetDate)} />
        </span>
      )}
    </div>
  );
}
