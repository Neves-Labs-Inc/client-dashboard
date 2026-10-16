import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import NavItem from "@/components/ui/nav-item";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderSyncProblemItem(count?: number): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        <NavItem
          to="/admin/clients/acme"
          label="Acme Corp"
          count={count}
          countLabel="active"
          alerts={[{ kind: "sync-problem" }]}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("a sidebar nav item with a sync problem", () => {
  // An explicit name: Chrome pads sr-only (absolute) spans with a space,
  // giving "Acme Corp , sync problem".
  it("speaks the alert in the link's name", () => {
    const html = renderSyncProblemItem();

    expect(html).toContain('aria-label="Acme Corp, sync problem"');
    expect(html).not.toContain("sr-only");
  });

  it("speaks the alert before the count", () => {
    const html = renderSyncProblemItem(3);

    expect(html).toContain('aria-label="Acme Corp, sync problem, 3 active"');
  });

  // Radix sets aria-describedby on the trigger only while the tooltip is
  // open; the item adds none of its own.
  it("leaves the link's description to the tooltip trigger", () => {
    const html = renderSyncProblemItem();

    const link = html.match(/<a [^>]*>/)?.[0];
    expect(link).toContain('data-state="closed"');
    expect(link).not.toContain("aria-describedby");
  });
});
