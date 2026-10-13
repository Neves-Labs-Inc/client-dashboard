import { Link } from "react-router";
import { cn } from "@/lib/utils";

type TabNavItem = { label: string; to: string; current: boolean };

type TabNavProps = {
  label: string;
  items: TabNavItem[];
};

// Page links styled as a tab row, not ARIA tabs (no role="tablist"). The
// row scrolls inside itself, so the page never scrolls sideways.
export default function TabNav({ label, items }: TabNavProps): React.ReactNode {
  return (
    <nav aria-label={label} className="border-b border-line">
      <ul className="flex [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.to} className="shrink-0">
            <Link
              to={item.to}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center px-3 text-[13px] whitespace-nowrap text-fg-2 transition-[color,background-color] duration-(--dur-instant) hover:bg-surface-2 hover:text-fg focus-visible:-outline-offset-2 md:h-9 pointer-coarse:h-11",
                item.current &&
                  "font-medium text-fg shadow-[inset_0_-2px_0_var(--color-accent)]",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
