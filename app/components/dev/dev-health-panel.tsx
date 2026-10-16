import HealthBadge from "@/components/ui/health-badge";
import Panel from "@/components/ui/panel";
import ProgressBar from "@/components/ui/progress-bar";
import type { Status } from "@/components/ui/status-icon";
import type { Health } from "@/lib/client-projects/client-project-rules";

const HEALTHS: Health[] = [
  "ON_TRACK",
  "AT_RISK",
  "OFF_TRACK",
  "COMPLETE",
  "INACTIVE",
];
const TONES: Status[] = ["ok", "risk", "off", "done", "idle"];
const PERCENTS = [0, 40, 100];

export default function DevHealthPanel(): React.ReactNode {
  return (
    <Panel id="health" title="Health & progress" meta="Badge · bar">
      <div className="flex flex-col gap-4 p-3 text-[13px]/5 text-fg">
        <section aria-labelledby="dev-health-badge">
          <h3
            id="dev-health-badge"
            className="mb-2 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase"
          >
            Health badge
          </h3>
          <ul className="flex flex-wrap gap-3">
            {HEALTHS.map((health) => (
              <li key={health}>
                <HealthBadge health={health} />
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="dev-progress-bar">
          <h3
            id="dev-progress-bar"
            className="mb-2 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase"
          >
            Progress bar
          </h3>
          <div className="mb-4 max-w-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">Pricing page</span>
              <span className="shrink-0 font-mono tabular-nums">60%</span>
            </div>
            <ProgressBar
              className="mt-1"
              percent={60}
              tone="ok"
              label="Pricing page progress"
            />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {TONES.map((tone) => (
              <li key={tone} className="flex flex-col gap-2">
                <span className="font-mono text-xs/4 text-fg-2 uppercase">
                  {tone}
                </span>
                {PERCENTS.map((percent) => (
                  <ProgressBar
                    key={percent}
                    percent={percent}
                    tone={tone}
                    label={`${tone} ${percent}% progress`}
                  />
                ))}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Panel>
  );
}
