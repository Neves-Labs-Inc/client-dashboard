import {
  type ComponentProps,
  createContext,
  type ElementType,
  type HTMLAttributes,
  useContext,
} from "react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import { REMARK_PLUGINS, transformUrl } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type MarkdownProps = { children: string; className?: string };

// Every surviving link leaves the portal: a new tab that can't reach back
// (noopener), sends no referrer, and passes no ranking.
const EXTERNAL_LINK = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
} as const;
const IMAGE_FALLBACK_TEXT = "Image";
// Said after every link's text, since each one leaves the page.
const NEW_TAB_NOTE = <span className="sr-only"> (opens in a new tab)</span>;

const LINK_CLASS =
  "rounded-[2px] text-accent-fg underline underline-offset-2 wrap-anywhere transition-colors duration-(--dur-instant) ease-(--ease-out) hover:no-underline";

// An image inside a link becomes that link's text: a second link would nest
// <a> in <a>, which the browser re-parses and hydration then mismatches.
const InsideLink = createContext(false);

type LinkProps = ComponentProps<"a"> & {
  "data-footnote-backref"?: unknown;
};

function MarkdownLink({
  href,
  children,
  "data-footnote-backref": footnoteBackref,
}: LinkProps) {
  // GFM's "↩" back to a footnote marker: an in-page link the URL policy
  // refuses, so it would only show as a stray arrow.
  if (footnoteBackref !== undefined) return null;
  // No href: the URL policy refused it, so only the text remains.
  if (href === undefined) return <>{children}</>;

  return (
    <a href={href} {...EXTERNAL_LINK} className={LINK_CLASS}>
      <InsideLink value={true}>{children}</InsideLink>
      {NEW_TAB_NOTE}
    </a>
  );
}

// Images are never loaded: a web image becomes a link to it, anything else
// (or one already inside a link) its alt text.
function MarkdownImage({ src, alt }: ComponentProps<"img">) {
  const isInsideLink = useContext(InsideLink);
  if (isInsideLink) return <>{alt || IMAGE_FALLBACK_TEXT}</>;
  if (typeof src !== "string") return <>{alt}</>;

  return (
    <a href={src} {...EXTERNAL_LINK} className={LINK_CLASS}>
      {alt || IMAGE_FALLBACK_TEXT}
      {NEW_TAB_NOTE}
    </a>
  );
}

type StyledProps = HTMLAttributes<HTMLElement> & ExtraProps;

// react-markdown passes its hast `node` to custom components; it must not
// reach the DOM as an attribute.
function withoutNode(props: StyledProps): HTMLAttributes<HTMLElement> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

// Renders `tag` with the house classes, keeping the classes Markdown gives
// it (GFM's sr-only footnote heading, `language-*` on code).
function styled(tag: ElementType, classes: string) {
  return function StyledElement(props: StyledProps) {
    const Tag = tag;
    return (
      <Tag {...withoutNode(props)} className={cn(classes, props.className)} />
    );
  };
}

// Headings start at h3 so a Status Update never outranks the page's own.
const COMPONENTS: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  h1: styled("h3", "text-base font-semibold"),
  h2: styled("h3", "text-base font-semibold"),
  h3: styled("h4", "font-semibold"),
  h4: styled("h5", "font-semibold"),
  h5: styled("h6", "font-semibold"),
  h6: styled("h6", "font-semibold"),
  // GFM task lists carry `contains-task-list`; their checkbox replaces the
  // bullet.
  ul: styled(
    "ul",
    "list-disc space-y-1 pl-5 [&.contains-task-list]:list-none [&.contains-task-list]:pl-0",
  ),
  ol: styled("ol", "list-decimal space-y-1 pl-5"),
  input: styled("input", "mr-1.5 align-middle accent-accent"),
  blockquote: styled("blockquote", "border-l-2 border-line pl-3 text-fg-2"),
  hr: styled("hr", "border-line"),
  code: styled(
    "code",
    "rounded-[3px] bg-surface-2 px-1 py-0.5 font-mono text-[13px]",
  ),
  // Scrolls inside its own box so a long line never widens the page; the box
  // takes focus so the keyboard can scroll it too.
  pre: (props: StyledProps) => (
    <pre
      {...withoutNode(props)}
      tabIndex={0}
      role="region"
      aria-label="Code"
      className="overflow-x-auto rounded-[3px] border border-line bg-surface-2 p-3 font-mono text-[13px] leading-5 [&>code]:bg-transparent [&>code]:p-0"
    />
  ),
  table: (props: StyledProps) => (
    <div
      tabIndex={0}
      role="region"
      aria-label="Table"
      className="overflow-x-auto rounded-[3px] border border-line"
    >
      <table
        {...withoutNode(props)}
        className="w-full border-collapse text-left"
      />
    </div>
  ),
  th: styled(
    "th",
    "border-b border-line px-3 py-1.5 font-semibold whitespace-nowrap",
  ),
  td: styled("td", "border-b border-line px-3 py-1.5"),
};

// A Status Update body as GitHub-flavoured Markdown. Raw HTML is skipped and
// URLs go through the link policy (lib/markdown); nothing is ever injected
// as HTML.
export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-3 font-sans text-sm wrap-break-word text-fg",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        urlTransform={transformUrl}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
