import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import NavItem from "@/components/ui/nav-item";

function render(count: number | undefined): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <NavItem
        to="/projects"
        label="Projects"
        count={count}
        countLabel="active"
      />
    </MemoryRouter>,
  );
}

describe("the Projects nav item", () => {
  it("reads the count to a screen reader", () => {
    expect(render(3)).toContain('aria-label="Projects, 3 active"');
  });

  it("shows no count when it is 0 or unknown", () => {
    expect(render(0)).not.toContain("aria-label");
    expect(render(undefined)).not.toContain("aria-label");
  });
});
