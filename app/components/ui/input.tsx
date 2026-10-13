import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input">;

// The focus ring comes from the base :focus-visible rule in app.css; the
// transition leaves outline-color out so the ring never fades in from black.
export default function Input({
  className,
  ...rest
}: InputProps): React.ReactNode {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[3px] border border-line-input bg-bg px-3 text-base text-fg transition-[color,background-color,border-color] duration-(--dur-instant) placeholder:text-fg-2 read-only:bg-surface-2 read-only:text-fg-2 hover:border-fg-2 focus-visible:border-accent disabled:bg-surface-2 disabled:text-fg-2 aria-invalid:border-off md:h-9 md:text-sm pointer-coarse:h-11 pointer-coarse:text-base",
        className,
      )}
      {...rest}
    />
  );
}
