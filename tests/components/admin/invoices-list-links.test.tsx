import { forwardRef } from "react";
import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoicesListView from "@/components/admin/invoices-list-view";
import type { AdminInvoiceRow } from "@/lib/invoices/invoices";

// The router is the boundary: record what each Link hands it, as a click
// would (there's no DOM to click in).
const linkStates = new Map<string, unknown>();

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  const RecordingLink = forwardRef<
    HTMLAnchorElement,
    React.ComponentProps<typeof actual.Link>
  >((props, ref) => {
    if (typeof props.to === "string") linkStates.set(props.to, props.state);
    return <actual.Link ref={ref} {...props} />;
  });
  return { ...actual, Link: RecordingLink };
});

const ROW: AdminInvoiceRow = {
  id: "0199d0a4-5b6c-7d8e-9f01-2345678900aa",
  number: "NL-0042-2026",
  issueDate: "2026-10-19",
  dueDate: "2026-11-18",
  totalCents: 125_000,
  status: "OPEN",
  client: { id: "c1", name: "Acme", isArchived: false },
};

async function renderAt(url: string): Promise<void> {
  const element = (
    <InvoicesListView
      clients={{ active: [], archived: [] }}
      years={[]}
      projectOptionsByClient={{}}
      today="2026-10-19"
      form={{
        status: "open",
        clientId: null,
        issued: "any",
        from: "",
        to: "",
        q: "42",
      }}
      rangeError={null}
      rows={[ROW]}
    />
  );
  const router = createMemoryRouter([{ path: "/admin/invoices", element }], {
    initialEntries: [url],
  });
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
}

beforeEach(() => {
  linkStates.clear();
});

describe("the global Invoices list's row links", () => {
  it("carry the list's search to the detail, for its back link", async () => {
    await renderAt("/admin/invoices?status=open&q=42");

    expect(linkStates.get(`/admin/invoices/${ROW.id}`)).toEqual({
      fromListSearch: "?status=open&q=42",
    });
  });

  it("carry an empty search from the unfiltered list", async () => {
    await renderAt("/admin/invoices");

    expect(linkStates.get(`/admin/invoices/${ROW.id}`)).toEqual({
      fromListSearch: "",
    });
  });
});
