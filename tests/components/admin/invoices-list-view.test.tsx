import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import InvoicesListView from "@/components/admin/invoices-list-view";
import type { InvoiceListForm } from "@/lib/admin-invoice-filter";
import type { InvoiceClientOptions } from "@/lib/admin-invoices";
import type { AdminInvoiceRow } from "@/lib/invoices/invoices";

const ACME_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const BETA_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const OLD_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcf";

const CLIENTS: InvoiceClientOptions = {
  active: [
    { id: ACME_ID, name: "Acme" },
    { id: BETA_ID, name: "Beta" },
  ],
  archived: [{ id: OLD_ID, name: "Old Co" }],
};
const NO_FILTER: InvoiceListForm = {
  status: "all",
  clientId: null,
  issued: "any",
  from: "",
  to: "",
  q: "",
};
const OPEN_ROW: AdminInvoiceRow = {
  id: "i1",
  number: "NL-0042-2026",
  issueDate: "2026-10-19",
  dueDate: "2026-11-18",
  totalCents: 125_000,
  status: "OPEN",
  client: { id: ACME_ID, name: "Acme", isArchived: false },
};
const VOID_ROW: AdminInvoiceRow = {
  ...OPEN_ROW,
  id: "i2",
  number: "NL-0031-2025",
  totalCents: 80_000,
  status: "VOID",
  client: { id: OLD_ID, name: "Old Co", isArchived: true },
};

type ViewProps = React.ComponentProps<typeof InvoicesListView>;

async function renderView(props: Partial<ViewProps> = {}): Promise<string> {
  const element = (
    <InvoicesListView
      clients={CLIENTS}
      years={[2026, 2025]}
      form={NO_FILTER}
      rangeError={null}
      rows={[OPEN_ROW, VOID_ROW]}
      projectOptionsByClient={{}}
      today="2026-10-19"
      {...props}
    />
  );
  const router = createMemoryRouter([{ path: "/admin/invoices", element }], {
    initialEntries: ["/admin/invoices"],
  });
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

function getText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function getHref(html: string, label: string): string | undefined {
  const pattern = new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${label}</a>`);
  return pattern.exec(html)?.[1]?.replaceAll("&amp;", "&");
}

describe("the global Invoices list", () => {
  it("says the Clients failed to load, not that there are none, in the Client filter", async () => {
    const html = await renderView({ clients: null });

    expect(html).toContain("Couldn&#x27;t load Clients.");
    const clientSelect = /<select[^>]*name="client"[^>]*>/.exec(html)?.[0];
    expect(clientSelect).toContain('disabled=""');
  });

  it("says the years failed to load in the Issued filter, keeping Any time and Custom range", async () => {
    const html = await renderView({ years: null });

    expect(html).toContain("Couldn&#x27;t load years.");
    const issuedSelect =
      /<select[^>]*name="issued"[^>]*>[\s\S]*?<\/select>/.exec(html)?.[0];
    expect(issuedSelect).not.toContain(`disabled=""`);
    expect(getText(issuedSelect ?? "").trim()).toBe("Any time Custom range");
  });

  it("offers New invoice in the header", async () => {
    const html = await renderView();

    expect(getText(html)).toMatch(/Invoices\s*New invoice/);
  });

  it("counts the rows shown and what is open in the panel meta", async () => {
    const html = await renderView();

    expect(html).toContain("2 invoices · open $1,250.00");
  });

  it("says 1 invoice for one row, open $0.00 when nothing is open", async () => {
    const html = await renderView({ rows: [VOID_ROW] });

    expect(html).toContain("1 invoice · open $0.00");
  });

  it("shows No Invoices yet with no filter set, and no meta or Clear filters", async () => {
    const html = await renderView({ rows: [] });

    expect(html).toContain("No Invoices yet.");
    expect(html).not.toContain("open $");
    expect(html).not.toContain("Clear filters");
  });

  it("offers Clear filters when a filter matches nothing", async () => {
    const html = await renderView({
      rows: [],
      form: { ...NO_FILTER, q: "9999" },
    });

    expect(html).toContain("No Invoices match these filters.");
    expect(html.match(/>Clear filters</g)).toHaveLength(2);
    expect(getHref(html, "Clear filters")).toBe("/admin/invoices");
  });

  it("shows the panel error, without meta, when the list failed", async () => {
    const html = await renderView({ rows: null });

    expect(html).toContain("Couldn&#x27;t load Invoices.");
    expect(html).not.toContain("open $");
  });

  it("tags an archived Client's row", async () => {
    const text = getText(await renderView());

    expect(text).toContain("NL-0031-2025 Old Co Archived");
  });
});

describe("the global Invoices filters", () => {
  it("is a GET search form, carrying the current status", async () => {
    const html = await renderView({ form: { ...NO_FILTER, status: "paid" } });

    const formTag = /<form[^>]*>/.exec(html)?.[0] ?? "";

    expect(formTag).toContain('method="get"');
    expect(formTag).toContain('role="search"');
    expect(formTag).toContain('aria-label="Filter Invoices"');
    expect(html).toMatch(/<input type="hidden" name="status" value="paid"/);
  });

  it("keeps the other filters on every status tab", async () => {
    const html = await renderView({
      form: { ...NO_FILTER, status: "paid", clientId: ACME_ID, q: "42" },
    });

    expect(getHref(html, "Open")).toBe(
      `/admin/invoices?status=open&client=${ACME_ID}&q=42`,
    );
    expect(getHref(html, "All")).toBe(`/admin/invoices?client=${ACME_ID}&q=42`);
    expect(html).toMatch(/aria-current="page"[^>]*>Paid</);
  });

  it("lists All clients, the active Clients, then an Archived group", async () => {
    const text = getText(await renderView());

    expect(text).toContain("All clients Acme Beta Old Co");
    expect(await renderView()).toContain('<optgroup label="Archived">');
  });

  it("leaves the Archived group out when there are none", async () => {
    const html = await renderView({
      clients: { ...CLIENTS, archived: [] },
    });

    expect(html).not.toContain("<optgroup");
  });

  it("offers Any time, each year, then Custom range", async () => {
    const text = getText(await renderView());

    expect(text).toContain("Any time 2026 2025 Custom range");
  });

  it("shows From and To only for a custom range", async () => {
    const plain = await renderView();
    const custom = await renderView({
      form: { ...NO_FILTER, issued: "custom", from: "2026-01-01" },
    });

    expect(plain).not.toContain('name="from"');
    expect(custom).toMatch(/name="from"[^>]*value="2026-01-01"/);
    expect(custom).toContain('name="to"');
  });

  it("marks both dates invalid, described by the range error", async () => {
    const html = await renderView({
      form: {
        ...NO_FILTER,
        issued: "custom",
        from: "2026-05-01",
        to: "2026-04-01",
      },
      rangeError: "From must be on or before To.",
    });
    const errorId =
      /<p id="([^"]+)"[^>]*>(?:(?!<\/p>).)*From must be on or before To\./.exec(
        html,
      )?.[1];
    const dates = html.match(/<input[^>]*type="date"[^>]*>/g) ?? [];

    expect(errorId).toBeDefined();
    expect(dates).toHaveLength(2);
    for (const input of dates) {
      expect(input).toContain('aria-invalid="true"');
      expect(input).toContain(`aria-describedby="${errorId}"`);
    }
  });

  it("caps the number search at 20 characters", async () => {
    const html = await renderView({ form: { ...NO_FILTER, q: "42" } });

    expect(html).toMatch(
      /name="q"[^>]*maxLength="20"|maxLength="20"[^>]*name="q"/i,
    );
    expect(html).toMatch(/placeholder="NL-0042"/);
  });
});

describe("the global Invoices list during a same-page filter change", () => {
  // The list is shown, then a filter navigation's loader hangs.
  async function renderSwitching(
    target: string,
    start = "/admin/invoices",
  ): Promise<string> {
    let loads = 0;
    const element = (
      <InvoicesListView
        clients={CLIENTS}
        years={[2026, 2025]}
        form={NO_FILTER}
        rangeError={null}
        rows={[OPEN_ROW, VOID_ROW]}
        projectOptionsByClient={{}}
        today="2026-10-19"
      />
    );
    const router = createMemoryRouter(
      [
        {
          path: "/admin/invoices",
          element,
          loader: () => (loads++ === 0 ? null : new Promise(() => {})),
        },
      ],
      { initialEntries: [start] },
    );
    await vi.waitFor(() => expect(router.state.initialized).toBe(true));
    void router.navigate(target);
    await vi.waitFor(() =>
      expect(router.state.navigation.state).toBe("loading"),
    );
    const stream = await renderToReadableStream(
      <RouterProvider router={router} />,
    );
    await stream.allReady;
    return new Response(stream).text();
  }

  it("shows the target tab current, skeleton rows and no meta", async () => {
    const html = await renderSwitching("/admin/invoices?status=paid");

    expect(html).toMatch(/aria-current="page"[^>]*>Paid</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>All</);
    expect(html).toMatch(/Loading (<!-- -->)?Invoices/);
    expect(html).not.toContain("NL-0042-2026");
    expect(html).not.toContain("open $");
  });

  it.each([
    [
      "opening on the unfiltered list",
      "/admin/invoices?new=invoice",
      undefined,
    ],
    [
      "opening on a filtered list",
      "/admin/invoices?status=paid&new=invoice",
      "/admin/invoices?status=paid",
    ],
    [
      "closing the drawer",
      "/admin/invoices?status=paid",
      "/admin/invoices?status=paid&new=invoice",
    ],
  ])("keeps rows and meta when %s", async (_name, target, start) => {
    const html = await renderSwitching(target, start);

    expect(html).not.toMatch(/Loading (<!-- -->)?Invoices/);
    expect(html).toContain("NL-0042-2026");
    expect(html).toContain("open $");
  });

  it("keeps the filter bar on the loading tab's status", async () => {
    const html = await renderSwitching("/admin/invoices?status=void");

    expect(html).toMatch(/<input type="hidden" name="status" value="void"/);
  });
});
