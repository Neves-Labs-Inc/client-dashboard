import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import SummaryRow from "@/components/ui/summary-row";
import SummaryTile from "@/components/ui/summary-tile";

function renderRow(tiles: React.ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SummaryRow label="Summary">{tiles}</SummaryRow>
    </MemoryRouter>,
  );
}

describe("the summary row", () => {
  it("puts a hairline left of the second of two tiles only", () => {
    const html = renderRow([
      <SummaryTile key="a" label="A" value="1" />,
      <SummaryTile key="b" label="B" value="2" />,
    ]);

    const [, first, second] = html.split("<li ");
    expect(html).toContain("grid-cols-2");
    expect(first).not.toContain("border-l");
    expect(second).toContain("border-l border-line");
    expect(html).not.toContain("border-t border-line");
  });

  it("lays four tiles out in two rows, then one row from md", () => {
    const html = renderRow(
      ["a", "b", "c", "d"].map((id) => (
        <SummaryTile key={id} label={id} value="1" />
      )),
    );

    const tiles = html.split("<li ").slice(1);
    expect(html).toContain("grid-cols-2 md:grid-cols-4");
    expect(tiles[2]).toContain("border-t border-line");
    expect(tiles[2]).toContain("md:border-t-0");
    expect(tiles[2]).toContain("md:border-l");
    expect(tiles[2]).not.toMatch(/(^|\s)border-l(\s|")/);
    expect(tiles[0]).not.toContain("border");
  });
});

describe("a summary tile", () => {
  it("is a link when it has an href, otherwise static", () => {
    const html = renderRow([
      <SummaryTile
        key="a"
        label="Active projects"
        value="3"
        href="/projects"
      />,
      <SummaryTile key="b" label="On track" value="2/3" />,
    ]);

    expect(html).toContain("<a ");
    expect(html).toContain('href="/projects"');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("speaks srValue instead of the visible value", () => {
    const html = renderToStaticMarkup(
      <SummaryTile
        label="On track"
        value="2/3"
        srValue="2 of 3 active Projects"
      />,
    );

    expect(html).toContain('aria-hidden="true">2/3<');
    expect(html).toContain(
      '<span class="sr-only">2 of 3 active Projects</span>',
    );
  });
});
