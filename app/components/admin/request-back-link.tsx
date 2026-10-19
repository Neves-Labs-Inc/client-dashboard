import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

type RequestBackLinkProps = {
  to: string;
  label: string;
  // The Request left, so the list can focus its row's title link.
  fromRequestId?: string;
  // Another list's marker (e.g. the Invoice left), when not a Request.
  state?: Record<string, string>;
};

export default function RequestBackLink({
  to,
  label,
  fromRequestId,
  state,
}: RequestBackLinkProps): React.ReactNode {
  return (
    <Link
      to={to}
      state={fromRequestId === undefined ? state : { fromRequestId }}
      className="inline-flex h-11 items-center gap-1.5 self-start rounded-[3px] text-[13px] font-medium text-accent-fg underline-offset-2 transition-[color,text-decoration-color] duration-(--dur-instant) hover:underline md:h-auto pointer-coarse:h-11"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {label}
    </Link>
  );
}
