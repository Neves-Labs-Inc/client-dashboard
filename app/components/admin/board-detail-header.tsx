import { ExternalLink } from "lucide-react";
import BoardBackLink from "@/components/admin/board-back-link";
import { BOARD_DETAIL_COPY, isHttpsUrl } from "@/lib/board-detail";

type BoardDetailHeaderProps = {
  clientId: string;
  projectId: string;
  name: string;
  url: string;
  // The board name, focused on an in-app arrival.
  nameRef: React.RefObject<HTMLHeadingElement | null>;
};

// Not a Panel: the back link, then the board name and its GitHub link.
export default function BoardDetailHeader({
  clientId,
  projectId,
  name,
  url,
  nameRef,
}: BoardDetailHeaderProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <BoardBackLink clientId={clientId} fromProjectId={projectId} />
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-3">
        <h2
          ref={nameRef}
          tabIndex={-1}
          className="text-sm/5 font-semibold wrap-anywhere text-fg outline-hidden"
        >
          {name}
        </h2>
        {/* Only an https URL becomes a link. On touch a pseudo-element
            grows the hit area past 44px; the focus ring stays on the text. */}
        {isHttpsUrl(url) && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative self-start text-[13px]/5 whitespace-nowrap text-accent-fg underline-offset-2 transition-[color,text-decoration-color] duration-(--dur-instant) hover:underline md:self-auto pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3.5"
          >
            {BOARD_DETAIL_COPY.github}
            <span className="sr-only">, opens in a new tab</span>
            <ExternalLink
              size={12}
              aria-hidden="true"
              className="ml-1 inline align-baseline text-fg-2"
            />
          </a>
        )}
      </div>
    </div>
  );
}
