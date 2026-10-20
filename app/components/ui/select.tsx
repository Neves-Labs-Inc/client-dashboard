import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectProps = React.ComponentProps<"select">;

// DESIGN §9.12: a native <select> in Input's box, with its own chevron. The
// focus ring comes from the base :focus-visible rule in app.css. A disabled
// select ignores hover through its own override: an `enabled:` guard would
// outrank the focus and invalid borders.
export default function Select({
  className,
  ...rest
}: SelectProps): React.ReactNode {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-[3px] border border-line-input bg-bg pr-9 pl-3 text-base text-fg transition-[color,background-color,border-color] duration-(--dur-instant) hover:border-fg-2 focus-visible:border-accent disabled:bg-surface-2 disabled:text-fg-2 disabled:hover:border-line-input aria-invalid:border-off disabled:aria-invalid:border-off md:h-9 md:text-sm pointer-coarse:h-11 pointer-coarse:text-base",
          className,
        )}
        {...rest}
      />
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-2"
      />
    </div>
  );
}
