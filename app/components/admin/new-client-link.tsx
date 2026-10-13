import { Plus } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

// Ticket 06 turns this target into the create-Client drawer.
export const NEW_CLIENT_HREF = "/admin?new=client";

type NewClientLinkProps = {
  variant?: "primary" | "secondary";
};

// A link that looks like Button, so the sizes match it.
export default function NewClientLink({
  variant = "primary",
}: NewClientLinkProps): React.ReactNode {
  return (
    <Link
      to={NEW_CLIENT_HREF}
      className={cn(
        buttonStyles({ variant }),
        "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      <Plus size={14} aria-hidden="true" />
      New client
    </Link>
  );
}
