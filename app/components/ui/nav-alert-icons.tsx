import { RefreshCwOff, type LucideIcon } from "lucide-react";

// What a Client row can flag. Phase 6 adds { kind: "new-requests"; count }
// and Phase 7 { kind: "overdue-invoice" }.
export type NavAlert = { kind: "sync-problem" };

const ALERT_DISPLAY: Record<
  NavAlert["kind"],
  { icon: LucideIcon; label: string }
> = {
  "sync-problem": { icon: RefreshCwOff, label: "Sync problem" },
};

// DESIGN §6.3 order: inbox, sync, receipt.
const ALERT_ORDER: NavAlert["kind"][] = ["sync-problem"];

export function sortAlerts(alerts: NavAlert[]): NavAlert[] {
  return [...alerts].sort(
    (a, b) => ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind),
  );
}

export function getAlertLabels(alerts: NavAlert[]): string[] {
  return sortAlerts(alerts).map((alert) => ALERT_DISPLAY[alert.kind].label);
}

// ", sync problem, ..." for the link's accessible name.
export function getAlertsSpokenText(alerts: NavAlert[]): string {
  return getAlertLabels(alerts)
    .map((label) => `, ${label.toLowerCase()}`)
    .join("");
}

export default function NavAlertIcons({
  alerts,
}: {
  alerts: NavAlert[];
}): React.ReactNode {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {sortAlerts(alerts).map((alert) => {
        const { icon: Icon } = ALERT_DISPLAY[alert.kind];
        return (
          <Icon
            key={alert.kind}
            size={16}
            aria-hidden="true"
            className="shrink-0 text-fg-2"
          />
        );
      })}
    </span>
  );
}
