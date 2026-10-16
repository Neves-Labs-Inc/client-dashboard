import Markdown, { type Options, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

// The Status Update Markdown policy, shared by the Markdown component and
// toPlainText so both parse the same GFM.

export const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm];

const LINK_PROTOCOLS: ReadonlySet<string> = new Set([
  "http:",
  "https:",
  "mailto:",
]);
// Images never load; they become links, so only web URLs qualify.
const IMAGE_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

// The hast nodes toPlainText reads. Text and raw carry `value`; elements
// carry `tagName`, `properties` and `children`.
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

// Elements that end a run of words, so their text never fuses with the next.
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
  "tr",
  "th",
  "td",
  "br",
  "hr",
]);

// Relative URLs have no protocol, so `new URL` throws and they are refused.
function hasProtocol(url: string, protocols: ReadonlySet<string>): boolean {
  let isAllowed = false;
  try {
    isAllowed = protocols.has(new URL(url).protocol);
  } catch {
    isAllowed = false;
  }
  return isAllowed;
}

// react-markdown drops an attribute whose transform returns null: a refused
// link renders without href, a refused image without src.
export const transformUrl: UrlTransform = (url, key) => {
  const protocols = key === "src" ? IMAGE_PROTOCOLS : LINK_PROTOCOLS;
  return hasProtocol(url, protocols) ? url : null;
};

const FOOTNOTE_PROPERTIES = [
  "dataFootnotes",
  "dataFootnoteRef",
  "dataFootnoteBackref",
] as const;

function isFootnoteApparatus(node: HastNode): boolean {
  const properties = node.properties ?? {};
  return FOOTNOTE_PROPERTIES.some((name) => properties[name] !== undefined);
}

function collectText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  // Raw HTML is skipped when rendered, so it never reaches the text either.
  if (node.type !== "element" && node.type !== "root") return "";
  // GFM footnotes: the marker, its back link and the definitions section are
  // apparatus, not the note itself.
  if (isFootnoteApparatus(node)) return "";
  if (node.tagName === "img") {
    const alt = node.properties?.alt;
    return typeof alt === "string" ? ` ${alt} ` : "";
  }

  const text = (node.children ?? []).map(collectText).join("");
  return node.tagName !== undefined && BLOCK_TAGS.has(node.tagName)
    ? ` ${text} `
    : text;
}

// Markdown stripped to one line of text: link text kept, images as their alt
// text, code as text, raw HTML dropped, whitespace collapsed.
export function toPlainText(markdown: string): string {
  let text = "";
  // Runs react-markdown's own (synchronous) pipeline and reads the hast tree
  // it builds. The rendered element is discarded.
  const captureText = () => (tree: unknown) => {
    // Trust boundary: a rehype transformer always receives a hast root.
    text = collectText(tree as HastNode);
  };
  Markdown({
    children: markdown,
    remarkPlugins: REMARK_PLUGINS,
    rehypePlugins: [captureText],
  });
  return text.replace(/\s+/g, " ").trim();
}
