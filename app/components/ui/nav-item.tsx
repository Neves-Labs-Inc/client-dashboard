import type { LucideIcon } from "lucide-react";
import { Link, NavLink } from "react-router";
import NavAlertIcons, {
  getAlertLabels,
  getAlertsSpokenText,
  type NavAlert,
} from "@/components/ui/nav-alert-icons";
import Tooltip from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type NavItemProps = {
  to: string;
  end?: boolean;
  label: string;
  icon?: LucideIcon;
  count?: number;
  // Spoken after the count ("3 active"); the count itself shows as a number.
  countLabel?: string;
  // Sidebar only: icons at the row's right edge, with a tooltip.
  alerts?: NavAlert[];
  variant?: "sidebar" | "tab";
  // Overrides NavLink's route matching (the gallery's hash links).
  active?: boolean;
  // The DESIGN §7 highlight fade, for an entry that just appeared.
  isHighlighted?: boolean;
};

const BASE_CLASS = {
  sidebar:
    "flex min-h-8 items-center gap-2 rounded-[3px] px-2 py-1.5 text-[13px]/5 text-fg-2 transition-[color,background-color,border-color] duration-(--dur-instant) hover:bg-surface-2 hover:text-fg active:bg-surface-3 pointer-coarse:min-h-11",
  tab: "inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-[13px]/5 text-fg-2 transition-[color,background-color,border-color] duration-(--dur-instant) hover:bg-surface-2 hover:text-fg focus-visible:-outline-offset-2",
} as const;

const ACTIVE_CLASS = {
  sidebar:
    "bg-surface-2 font-medium text-fg shadow-[inset_2px_0_0_var(--color-accent)]",
  tab: "bg-surface-2 text-fg shadow-[inset_0_-2px_0_var(--color-accent)]",
} as const;

export default function NavItem({
  to,
  end,
  label,
  icon: Icon,
  count,
  countLabel,
  alerts = [],
  variant = "sidebar",
  active,
  isHighlighted = false,
}: NavItemProps): React.ReactNode {
  const getClassName = (isActive: boolean): string =>
    cn(
      BASE_CLASS[variant],
      isActive && ACTIVE_CLASS[variant],
      isHighlighted && "animate-nav-highlight motion-reduce:animate-none",
    );

  const hasAlerts = variant === "sidebar" && alerts.length > 0;
  const hasCount = variant === "sidebar" && Boolean(count);
  const hasSpokenCount = hasCount && Boolean(countLabel);
  // Spelled out, not sr-only spans: Chrome pads absolutely positioned spans
  // with a space ("Acme Corp , sync problem").
  const ariaLabel =
    hasAlerts || hasSpokenCount
      ? [
          label,
          hasAlerts && getAlertsSpokenText(alerts),
          hasCount && (countLabel ? `, ${count} ${countLabel}` : ` ${count}`),
        ]
          .filter(Boolean)
          .join("")
      : undefined;
  const content = (
    <>
      {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
      {hasCount && (
        <span className="ml-auto font-mono text-xs/4 text-fg-2 tabular-nums">
          {count}
        </span>
      )}
      {hasAlerts && <NavAlertIcons alerts={alerts} />}
    </>
  );

  const link =
    active !== undefined ? (
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        aria-label={ariaLabel}
        className={getClassName(active)}
      >
        {content}
      </Link>
    ) : (
      <NavLink
        to={to}
        end={end}
        aria-label={ariaLabel}
        className={({ isActive }) => getClassName(isActive)}
      >
        {content}
      </NavLink>
    );

  if (!hasAlerts) return link;

  // While open, Radix points the link's aria-describedby at the tooltip, so a
  // screen reader hears the alert twice. Accepted: Slot merges the attribute,
  // so the link can't opt out without a wrapper.
  return (
    <Tooltip
      side="right"
      content={getAlertLabels(alerts).map((label) => (
        <span key={label} className="block">
          {label}
        </span>
      ))}
    >
      {link}
    </Tooltip>
  );
}
