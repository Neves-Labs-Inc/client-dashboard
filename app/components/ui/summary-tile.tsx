import { Link } from "react-router";

type SummaryTileProps = {
  label: string;
  value: React.ReactNode;
  // The spoken form of the value ("2 of 3 active Projects").
  srValue?: string;
  // Makes the whole tile a link.
  href?: string;
};

const BOX_CLASS = "block h-full px-3 py-2.5";
const LINK_CLASS =
  "transition-[background-color] duration-(--dur-instant) ease-(--ease-out) hover:bg-surface-2 active:bg-surface-3 focus-visible:-outline-offset-2";

export default function SummaryTile({
  label,
  value,
  srValue,
  href,
}: SummaryTileProps): React.ReactNode {
  const content = (
    <>
      <span className="block text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase">
        {label}
      </span>
      <span className="mt-0.5 block truncate font-mono text-xl/7 font-medium text-fg tabular-nums">
        <span aria-hidden={srValue ? "true" : undefined}>{value}</span>
        {srValue && <span className="sr-only">{srValue}</span>}
      </span>
    </>
  );

  return href ? (
    <Link to={href} className={`${BOX_CLASS} ${LINK_CLASS}`}>
      {content}
    </Link>
  ) : (
    <div className={BOX_CLASS}>{content}</div>
  );
}
