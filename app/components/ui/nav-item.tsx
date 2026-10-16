import type { LucideIcon } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";

type NavItemProps = {
  to: string;
  end?: boolean;
  label: string;
  icon?: LucideIcon;
  count?: number;
  // Spoken after the count ("3 active"); the count itself shows as a number.
  countLabel?: string;
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

  const content = (
    <>
      {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
      {variant === "sidebar" && Boolean(count) && (
        <span className="ml-auto font-mono text-xs/4 text-fg-2 tabular-nums">
          {countLabel && <span className="sr-only">, </span>}
          {count}
          {countLabel && <span className="sr-only"> {countLabel}</span>}
        </span>
      )}
    </>
  );

  if (active !== undefined) {
    return (
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        className={getClassName(active)}
      >
        {content}
      </Link>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => getClassName(isActive)}
    >
      {content}
    </NavLink>
  );
}
