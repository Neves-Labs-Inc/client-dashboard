import DateText from "@/components/ui/date-text";
import Panel from "@/components/ui/panel";
import Skeleton from "@/components/ui/skeleton";
import StatusIcon from "@/components/ui/status-icon";

const STATUSES = ["ok", "risk", "off", "done", "idle"] as const;

export default function DevStatesPanel(): React.ReactNode {
  // Computed from today, never a hard-coded year.
  const now = new Date();
  const previousYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 5, 28, 12));

  return (
    <Panel id="states" title="States & data" meta="Dates · icons · skeleton">
      <div className="flex flex-col gap-3 p-3 text-[13px]/5 text-fg">
        <p>
          Current year: <DateText date={now} />
        </p>
        <p>
          Previous year: <DateText date={previousYear} />
        </p>
        <ul className="flex flex-wrap gap-4">
          {STATUSES.map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <StatusIcon status={status} size={16} />
              <span className="font-mono text-xs/4 text-fg-2 uppercase">
                {status}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
    </Panel>
  );
}
