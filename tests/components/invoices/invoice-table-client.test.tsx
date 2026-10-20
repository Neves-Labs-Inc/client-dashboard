import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import InvoiceTable from "@/components/invoices/invoice-table";
import type { AdminInvoiceRow } from "@/lib/invoices/invoices";

const ROWS: AdminInvoiceRow[] = [
  {
    id: "i1",
    number: "NL-0042-2026",
    issueDate: "2026-10-19",
    dueDate: "2026-11-18",
    totalCents: 125_000,
    status: "OPEN",
    client: { id: "c1", name: "Acme Corp", isArchived: false },
  },
  {
    id: "i2",
    number: "NL-0031-2025",
    issueDate: "2025-05-29",
    dueDate: "2025-06-28",
    totalCents: 80_000,
    status: "VOID",
    client: { id: "c2", name: "Old Client Inc", isArchived: true },
  },
];

async function renderTable(node: React.ReactNode): Promise<string> {
  const router = createMemoryRouter([{ path: "/", element: node }]);
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

function getText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("the Invoice table with a Client column", () => {
  it("heads a Client column between Number and Issued", async () => {
    const html = await renderTable(
      <InvoiceTable invoices={ROWS} getHref={(id) => `/x/${id}`} hasClient />,
    );

    expect(getText(html)).toContain("Number Client Issued Due Amount Status");
  });

  it("names each row's Client, tagging an archived one", async () => {
    const html = await renderTable(
      <InvoiceTable invoices={ROWS} getHref={(id) => `/x/${id}`} hasClient />,
    );
    const text = getText(html);

    expect(text).toContain("NL-0042-2026 Acme Corp");
    expect(text).toContain("NL-0031-2025 Old Client Inc Archived");
    expect(html.match(/Archived/g)).toHaveLength(1);
  });

  it("leaves the Client out of the default table", async () => {
    const html = await renderTable(
      <InvoiceTable invoices={ROWS} getHref={(id) => `/x/${id}`} />,
    );

    expect(getText(html)).toContain("Number Issued Due Amount Status");
    expect(html).not.toContain("Acme Corp");
  });
});
