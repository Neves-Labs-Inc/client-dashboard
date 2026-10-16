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
    expect(render(3)).toContain(
      '<span class="sr-only">, </span>3<span class="sr-only"> active</span>',
    );
  });

  it("shows no count when it is 0 or unknown", () => {
    expect(render(0)).not.toContain("sr-only");
    expect(render(undefined)).not.toContain("sr-only");
  });
});
