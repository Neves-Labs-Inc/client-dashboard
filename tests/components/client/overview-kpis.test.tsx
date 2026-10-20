import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import OverviewKpis from "@/components/client/overview-kpis";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";
import type { InvoiceSummary } from "@/lib/invoices/invoices";

async function render(
  summary: InvoiceSummary | null,
  projects: Promise<ProjectSummary[] | null> = Promise.resolve(null),
): Promise<string> {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <OverviewKpis
          projects={projects}
          invoiceSummary={Promise.resolve(summary)}
        />
      ),
    },
  ]);
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

describe("the Overview KPI row", () => {
  it("shows the open balance as a link to Invoices and the overdue count in the off colour with an icon", async () => {
    const html = await render({
      openCount: 3,
      openBalanceCents: 425_000,
      overdueCount: 2,
    });

    expect(html).toContain("$4,250.00");
    expect(html).toContain('href="/invoices"');
    expect(html).toMatch(/text-off[^>]*><svg[^>]*>.*<\/svg>2</);
  });

  it("shows $0.00 and a plain 0 with no icon when nothing is owed", async () => {
    const html = await render({
      openCount: 0,
      openBalanceCents: 0,
      overdueCount: 0,
    });

    expect(html).toContain("$0.00");
    expect(html).not.toContain("text-off");
  });

  it("marks only the two Invoice tiles unavailable when the summary is null", async () => {
    const html = await render(null, Promise.resolve([]));

    expect(html.match(/unavailable/g)).toHaveLength(2);
    expect(html).toContain("0/0");
  });
});
