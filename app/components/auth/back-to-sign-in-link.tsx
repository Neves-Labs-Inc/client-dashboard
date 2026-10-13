import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

export default function BackToSignInLink(): React.ReactNode {
  return (
    <Link
      to="/sign-in"
      className="inline-flex h-11 items-center gap-1.5 self-start rounded-[3px] text-sm font-medium text-accent-fg underline-offset-2 transition-[color,text-decoration-color] duration-(--dur-instant) hover:underline md:h-auto pointer-coarse:h-11"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Back to sign in
    </Link>
  );
}
