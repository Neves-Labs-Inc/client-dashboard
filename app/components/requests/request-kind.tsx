import type { RequestKind as Kind } from "@/lib/requests/request-rules";
import { cn } from "@/lib/utils";

export const REQUEST_KIND_LABEL: Record<Kind, string> = {
  BUG: "Bug",
  FEATURE: "Feature",
};

const GLYPH_SIZE = 12;

type RequestKindGlyphProps = {
  kind: Kind;
  className?: string;
};

// Bug a filled square in `off`, Feature a filled diamond in `accent-fg`.
// Decorative: the word always sits next to it.
export function RequestKindGlyph({
  kind,
  className,
}: RequestKindGlyphProps): React.ReactNode {
  return (
    <svg
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      className={cn(
        "shrink-0",
        kind === "BUG" ? "text-off" : "text-accent-fg",
        className,
      )}
    >
      {kind === "BUG" ? (
        <rect x="2" y="2" width="8" height="8" rx="1" />
      ) : (
        <path d="M6 1l5 5-5 5-5-5z" />
      )}
    </svg>
  );
}

type RequestKindProps = {
  kind: Kind;
};

// The word stays `fg`: a teal "Feature" would read as a link.
export default function RequestKind({
  kind,
}: RequestKindProps): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]/5 whitespace-nowrap text-fg">
      <RequestKindGlyph kind={kind} />
      {REQUEST_KIND_LABEL[kind]}
    </span>
  );
}
