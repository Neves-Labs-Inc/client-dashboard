import { cva } from "class-variance-authority";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

// Shared by Button and IconButton. Hover and press go through
// `not-disabled:not-aria-busy:`, so a disabled or pending button never
// reacts; disabled (not pending) uses tokens, never opacity.
export const buttonStyles = cva(
  [
    "inline-flex items-center justify-center gap-1.5 rounded-[3px] border font-medium",
    "transition-[color,background-color,border-color,transform] duration-(--dur-instant) ease-out",
    "not-disabled:not-aria-busy:active:scale-[0.98] motion-reduce:not-disabled:not-aria-busy:active:scale-100",
    "disabled:not-aria-busy:cursor-not-allowed disabled:not-aria-busy:border-line disabled:not-aria-busy:bg-surface-2 disabled:not-aria-busy:text-fg-2",
    "aria-busy:cursor-progress",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-accent bg-accent text-on-accent not-disabled:not-aria-busy:hover:border-accent-hover not-disabled:not-aria-busy:hover:bg-accent-hover",
        secondary:
          "border-line-strong bg-surface-2 text-fg not-disabled:not-aria-busy:hover:bg-surface-3",
        ghost:
          "border-transparent text-fg-2 not-disabled:not-aria-busy:hover:bg-surface-2 not-disabled:not-aria-busy:hover:text-fg",
        // Not surface-3: `off` on surface-3 is 4.1:1, under AA.
        destructive:
          "border-line-strong bg-surface-2 text-off not-disabled:not-aria-busy:hover:bg-off-subtle",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);
