import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

type ExitPreviewLinkProps = {
  // The Client's Projects & boards tab.
  href: string;
};

// The banner's way out. On the banner's surface-2 the secondary fill would
// blend in, so this one sits on surface (hover still surface-3).
export default function ExitPreviewLink({
  href,
}: ExitPreviewLinkProps): React.ReactNode {
  return (
    <Link
      to={href}
      className={cn(
        buttonStyles({ variant: "secondary" }),
        "h-11 bg-surface px-4 text-sm whitespace-nowrap md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Exit preview
    </Link>
  );
}
