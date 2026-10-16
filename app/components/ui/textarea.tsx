import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea">;

// DESIGN §9.12: Input's box and states, growing with `resize-y` from 96px
// instead of a fixed height. The focus ring comes from the base
// :focus-visible rule in app.css.
export default function Textarea({
  className,
  ...rest
}: TextareaProps): React.ReactNode {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-[3px] border border-line-input bg-bg px-3 py-2 text-base text-fg transition-[color,background-color,border-color] duration-(--dur-instant) placeholder:text-fg-2 hover:border-fg-2 focus-visible:border-accent disabled:bg-surface-2 disabled:text-fg-2 aria-invalid:border-off md:text-sm pointer-coarse:text-base",
        className,
      )}
      {...rest}
    />
  );
}
