import { Eye } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { getPreviewPath } from "@/lib/client-paths";
import { cn } from "@/lib/utils";

type PreviewLinkProps = {
  clientId: string;
};

// Opens the Client's read-only preview, in the same tab. A link that looks
// like Button, so the sizes match it.
export default function PreviewLink({
  clientId,
}: PreviewLinkProps): React.ReactNode {
  return (
    <Link
      to={getPreviewPath(clientId)}
      className={cn(
        buttonStyles({ variant: "secondary" }),
        "h-11 px-4 text-sm whitespace-nowrap md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      <Eye size={14} aria-hidden="true" />
      Preview
    </Link>
  );
}
