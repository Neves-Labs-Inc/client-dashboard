import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Markdown from "@/components/ui/markdown";

function render(body: string): string {
  return renderToStaticMarkup(<Markdown>{body}</Markdown>);
}

const NEW_TAB = 'target="_blank" rel="noopener noreferrer nofollow"';

describe("Markdown", () => {
  it("drops raw HTML: no script, no img, no event handler", () => {
    const html = render(
      "Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nBye",
    );

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).toContain("Bye");
  });

  it("renders javascript:, data: and relative links as text with no href", () => {
    const html = render(
      "[x](javascript:alert(1)) [y](data:text/html,hi) [z](/admin) [w](JaVaScript:alert(1))",
    );

    expect(html).not.toContain("href");
    expect(html).not.toContain("<a");
    expect(html).toContain("x");
    expect(html).toContain("y");
  });

  it("opens http, https and mailto links in a new tab", () => {
    const html = render(
      "[site](https://example.com) [old](http://example.com) [mail](mailto:a@b.co)",
    );

    expect(html).toContain(`<a href="https://example.com" ${NEW_TAB}`);
    expect(html).toContain(`href="http://example.com"`);
    expect(html).toContain(`href="mailto:a@b.co"`);
    expect(html.match(new RegExp(NEW_TAB, "g"))).toHaveLength(3);
  });

  it("turns autolinks into new-tab links", () => {
    const html = render("See https://example.com/docs today");

    expect(html).toContain(`href="https://example.com/docs" ${NEW_TAB}`);
  });

  it("renders an http(s) image as a link with its alt text, never an img", () => {
    const html = render(
      "![chart](https://example.com/a.png) ![](https://example.com/b.png)",
    );

    expect(html).not.toMatch(/<img/i);
    expect(html).toContain(`href="https://example.com/a.png" ${NEW_TAB}`);
    expect(html).toMatch(/<a [^>]*a\.png[^>]*>chart<span/);
    expect(html).toMatch(/<a [^>]*b\.png[^>]*>Image<span/);
  });

  it("renders any other image as its alt text only", () => {
    const html = render(
      "![secret](javascript:alert(1)) ![pixel](data:image/png;base64,AAAA) ![local](/a.png)",
    );

    expect(html).not.toMatch(/<img|<a|href|src/i);
    expect(html).toContain("secret");
    expect(html).toContain("pixel");
    expect(html).toContain("local");
  });

  it("renders GFM tables in their own scroll box, task lists and strikethrough", () => {
    const html = render(
      "| Step | State |\n| --- | --- |\n| Build | ~~late~~ done |\n\n- [x] Ship\n- [ ] Review",
    );

    expect(html).toMatch(
      /<div tabindex="0" role="region" aria-label="Table" class="[^"]*overflow-x-auto[^"]*"><table/,
    );
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("<del");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });

  it("scrolls code blocks in their own box and leaks no node attribute", () => {
    const html = render("# Title\n\n```\nconst x = 1;\n```\n\n- `inline`");

    expect(html).toMatch(
      /<pre tabindex="0" role="region" aria-label="Code" class="[^"]*overflow-x-auto[^"]*"><code/,
    );
    expect(html).toContain("const x = 1;");
    expect(html).not.toContain("node=");
    expect(html).not.toContain("[object Object]");
  });

  it("renders a linked image as one link with the image's alt text", () => {
    const html = render("[![build](https://x.co/b.svg)](https://x.co/ci)");

    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`<a href="https://x.co/ci" ${NEW_TAB}`);
    expect(html).toMatch(/>build<span/);
    expect(html).not.toMatch(/<img/i);
  });

  it("tells screen readers that a link opens in a new tab", () => {
    const html = render("[docs](https://example.com/docs)");

    expect(html).toMatch(
      /<a [^>]*>docs<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/,
    );
  });

  it("keeps the footnotes heading screen-reader only and drops backrefs", () => {
    const html = render("Note[^1]\n\n[^1]: The source");

    expect(html).toMatch(/<h3 [^>]*class="[^"]*sr-only[^"]*"[^>]*>Footnotes/);
    expect(html).toContain("The source");
    expect(html).not.toContain("↩");
  });

  it("keeps the class Markdown gives an element", () => {
    const html = render("```ts\nconst x = 1;\n```");

    expect(html).toMatch(/<code class="[^"]*language-ts[^"]*"/);
  });
});
