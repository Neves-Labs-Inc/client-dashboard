import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { BOARD_DETAIL_COPY } from "@/lib/board-detail";
import { getProjectsPath } from "@/lib/link-board";

type BoardBackLinkProps = {
  clientId: string;
  // The board left, so the tab can focus its row's name link.
  fromProjectId?: string;
};

export default function BoardBackLink({
  clientId,
  fromProjectId,
}: BoardBackLinkProps): React.ReactNode {
  return (
    <Link
      to={getProjectsPath(clientId)}
      state={fromProjectId === undefined ? undefined : { fromProjectId }}
      className="inline-flex h-11 items-center gap-1.5 self-start rounded-[3px] text-[13px] font-medium text-accent-fg underline-offset-2 transition-[color,text-decoration-color] duration-(--dur-instant) hover:underline md:h-auto pointer-coarse:h-11"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {BOARD_DETAIL_COPY.back}
    </Link>
  );
}
