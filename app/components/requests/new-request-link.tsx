import { Plus } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { NEW_REQUEST_SEARCH } from "@/lib/request-drawer";
import { cn } from "@/lib/utils";

type NewRequestLinkProps = {
  variant?: "primary" | "secondary";
  ref?: React.Ref<HTMLAnchorElement>;
};

// A link that looks like Button: it opens the Request drawer on the current
// page through the URL, so it works before hydration.
export default function NewRequestLink({
  variant = "primary",
  ref,
}: NewRequestLinkProps): React.ReactNode {
  return (
    <Link
      ref={ref}
      to={NEW_REQUEST_SEARCH}
      preventScrollReset
      className={cn(
        buttonStyles({ variant }),
        "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      <Plus size={14} aria-hidden="true" />
      New request
    </Link>
  );
}
