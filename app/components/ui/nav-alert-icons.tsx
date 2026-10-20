import { Inbox, Receipt, RefreshCwOff, type LucideIcon } from "lucide-react";

// What a Client row can flag.
export type NavAlert =
  | { kind: "new-requests"; count: number }
  | { kind: "sync-problem" }
  | { kind: "overdue-invoice" };

type AlertKind = NavAlert["kind"];

const ALERT_ICONS: Record<AlertKind, LucideIcon> = {
  "new-requests": Inbox,
  "sync-problem": RefreshCwOff,
  "overdue-invoice": Receipt,
};

// DESIGN §6.3 order: inbox, sync, receipt.
const ALERT_ORDER: AlertKind[] = [
  "new-requests",
  "sync-problem",
  "overdue-invoice",
];

export function sortAlerts(alerts: NavAlert[]): NavAlert[] {
  return [...alerts].sort(
    (a, b) => ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind),
  );
}

function getLabel(alert: NavAlert): string {
  if (alert.kind === "sync-problem") return "Sync problem";
  if (alert.kind === "overdue-invoice") return "Overdue Invoices";

  return alert.count === 1
    ? `${alert.count} New Request`
    : `${alert.count} New Requests`;
}

// "New Request" and "Overdue Invoices" are domain terms, so only the sync
// problem is lowercased.
function getSpokenLabel(alert: NavAlert): string {
  return alert.kind === "sync-problem" ? "sync problem" : getLabel(alert);
}

export function getAlertLabels(alerts: NavAlert[]): string[] {
  return sortAlerts(alerts).map(getLabel);
}

// ", 3 New Requests, sync problem" for the link's accessible name.
export function getAlertsSpokenText(alerts: NavAlert[]): string {
  return sortAlerts(alerts)
    .map((alert) => `, ${getSpokenLabel(alert)}`)
    .join("");
}

export default function NavAlertIcons({
  alerts,
}: {
  alerts: NavAlert[];
}): React.ReactNode {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {sortAlerts(alerts).map((alert) => {
        const Icon = ALERT_ICONS[alert.kind];
        const icon = (
          <Icon size={16} aria-hidden="true" className="shrink-0 text-fg-2" />
        );
        if (alert.kind !== "new-requests") {
          return <span key={alert.kind}>{icon}</span>;
        }
        return (
          <span key={alert.kind} className="flex items-center gap-1">
            {icon}
            <span
              aria-hidden="true"
              className="font-mono text-xs/4 text-fg-2 tabular-nums"
            >
              {alert.count}
            </span>
          </span>
        );
      })}
    </span>
  );
}
