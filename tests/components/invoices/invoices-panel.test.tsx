import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import InvoiceTable from "@/components/invoices/invoice-table";
import InvoicesPanel from "@/components/invoices/invoices-panel";
import type { InvoiceRow, InvoiceSummary } from "@/lib/invoices/invoices";

function makeInvoices(count: number): InvoiceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `i${index}`,
    number: `NL-000${index}-2026`,
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    totalCents: 125_000,
    status: "OPEN",
  }));
}

const SUMMARY: InvoiceSummary = {
  openCount: 2,
  openBalanceCents: 425_000,
  overdueCount: 0,
};

async function renderNode(node: React.ReactNode): Promise<string> {
  const router = createMemoryRouter([{ path: "/", element: node }]);
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

function renderPanel(
  invoices: InvoiceRow[] | null,
  summary: InvoiceSummary | null = SUMMARY,
): Promise<string> {
  return renderNode(
    <InvoicesPanel
      invoices={Promise.resolve(invoices)}
      summary={Promise.resolve(summary)}
    />,
  );
}

describe("the Overview Invoices panel", () => {
  it("shows five rows, the open balance and no View all when exactly five came back", async () => {
    const html = await renderPanel(makeInvoices(5));

    expect(html.match(/NL-000\d-2026/g)).toHaveLength(5);
    expect(html).toContain("open $4,250.00");
    expect(html).not.toContain("View all");
  });

  it("caps a sixth row and offers View all", async () => {
    const html = await renderPanel(makeInvoices(6));

    expect(html).not.toContain("NL-0005-2026");
    expect(html).toContain('aria-label="View all Invoices"');
  });

  it("says there are none, with no open balance", async () => {
    const html = await renderPanel([]);

    expect(html).toContain("No Invoices yet.");
    expect(html).not.toContain("open $");
  });

  it("keeps the header and says it couldn't load when the list is null", async () => {
    const html = await renderPanel(null);

    expect(html).toContain("Invoices</a>");
    expect(html).toContain("Couldn&#x27;t load Invoices.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("open $");
  });

  it("keeps the rows, without a balance, when the summary rejects", async () => {
    const rejected = Promise.reject(new Error("connection lost"));
    rejected.catch(() => {});
    const html = await renderNode(
      <InvoicesPanel
        invoices={Promise.resolve(makeInvoices(2))}
        summary={rejected}
      />,
    );

    expect(html).toContain("NL-0000-2026");
    expect(html).not.toContain("open $");
    expect(html).not.toContain("load Invoices");
  });

  it("shows the rows without a balance when the summary is null", async () => {
    const html = await renderPanel(makeInvoices(1), null);

    expect(html).toContain("NL-0000-2026");
    expect(html).not.toContain("open $");
  });
});

describe("the compact Invoice table", () => {
  it("hides Issued visually at every width but keeps it for screen readers", async () => {
    const html = await renderNode(
      <InvoiceTable
        invoices={makeInvoices(1)}
        getHref={(id) => `/invoices/${id}`}
        isCompact
      />,
    );

    expect(html).toMatch(
      /role="columnheader"[^>]*class="[^"]*\bsr-only\b[^"]*"[^>]*>Issued/,
    );
    expect(html).not.toContain("lg:not-sr-only");
    expect(html).toContain(">Sep 1</time>");
  });

  it("shows Issued from lg in the full table", async () => {
    const html = await renderNode(
      <InvoiceTable
        invoices={makeInvoices(1)}
        getHref={(id) => `/invoices/${id}`}
      />,
    );

    expect(html).toContain("lg:not-sr-only");
  });
});
