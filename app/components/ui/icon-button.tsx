import type { LucideIcon } from "lucide-react";
import {
  buttonStyles,
  type ButtonVariant,
} from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string;
  icon?: LucideIcon;
  // Custom content (an avatar) instead of an icon.
  children?: React.ReactNode;
  size?: "default" | "touch";
  variant?: ButtonVariant;
};

export default function IconButton({
  label,
  icon: Icon,
  children,
  size = "default",
  variant = "ghost",
  className,
  type = "button",
  ...rest
}: IconButtonProps): React.ReactNode {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        buttonStyles({ variant }),
        size === "touch"
          ? "size-11"
          : "size-11 md:size-8 pointer-coarse:size-11",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
