import type { LucideIcon } from "lucide-react";
import Spinner from "@/components/ui/spinner";
import {
  buttonStyles,
  type ButtonVariant,
} from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

type ButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  children: React.ReactNode;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  isPending?: boolean;
  pendingLabel?: string;
};

export default function Button({
  variant = "secondary",
  icon: Icon,
  isPending = false,
  pendingLabel,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps): React.ReactNode {
  const contentClass = "inline-flex items-center justify-center gap-1.5";

  return (
    <button
      type={type}
      disabled={disabled || isPending}
      aria-busy={isPending || undefined}
      className={cn(
        buttonStyles({ variant }),
        "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
        className,
      )}
      {...rest}
    >
      {/* Both labels share one grid cell, so the button is always as wide as
          the longer one and never shifts when it goes pending. */}
      <span className="grid *:[grid-area:1/1]">
        <span
          className={cn(contentClass, isPending && "invisible")}
          aria-hidden={isPending || undefined}
        >
          {Icon && <Icon size={14} aria-hidden="true" />}
          {children}
        </span>
        <span
          className={cn(contentClass, !isPending && "invisible")}
          aria-hidden={!isPending || undefined}
        >
          <Spinner />
          {pendingLabel ?? children}
        </span>
      </span>
    </button>
  );
}
