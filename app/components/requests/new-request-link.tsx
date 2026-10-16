import { Plus } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { NEW_REQUEST_SEARCH } from "@/lib/request-drawer";
import { cn } from "@/lib/utils";

type NewRequestLinkProps = {
  variant?: "primary" | "secondary";
  label?: string;
  // For a shortened visible label ("New") that still names the action.
  ariaLabel?: string;
  hasIcon?: boolean;
  // Lets the page remember which trigger opened the drawer.
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  ref?: React.Ref<HTMLAnchorElement>;
};

// A link that looks like Button: it opens the Request drawer on the current
// page through the URL, so it works before hydration.
export default function NewRequestLink({
  variant = "primary",
  label = "New request",
  ariaLabel,
  hasIcon = true,
  onClick,
  ref,
}: NewRequestLinkProps): React.ReactNode {
  return (
    <Link
      ref={ref}
      to={NEW_REQUEST_SEARCH}
      preventScrollReset
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        buttonStyles({ variant }),
        "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      {hasIcon && <Plus size={14} aria-hidden="true" />}
      {label}
    </Link>
  );
}
