import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import RequestsPanel from "@/components/requests/requests-panel";
import type { RequestRow } from "@/lib/requests/requests";

function makeRequests(count: number): RequestRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    kind: "BUG",
    title: `Request number ${index}`,
    status: "NEW",
    submitterName: "Maya Chen",
    createdAt: new Date("2026-10-07"),
  }));
}

// Waits for the streamed list, so the resolved panel is what we read.
async function render(requests: RequestRow[] | null): Promise<string> {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <RequestsPanel requests={Promise.resolve(requests)} />,
    },
  ]);
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

describe("the Overview Requests panel", () => {
  it("shows five rows and no View all when exactly five came back", async () => {
    const html = await render(makeRequests(5));

    expect(html.match(/Request number \d/g)).toHaveLength(5);
    expect(html).not.toContain("View all");
  });

  it("caps a sixth row and offers View all", async () => {
    const html = await render(makeRequests(6));

    expect(html.match(/Request number \d/g)).toHaveLength(5);
    expect(html).not.toContain("Request number 5");
    expect(html).toContain('aria-label="View all Requests"');
  });

  it("invites the first Request when there are none", async () => {
    const html = await render([]);

    expect(html).toContain(
      "No Requests yet. Report a bug or ask for a feature.",
    );
    expect(html).toContain(">New request</a>");
  });

  it("keeps the header and says it couldn't load when the list is null", async () => {
    const html = await render(null);

    expect(html).toContain("Couldn&#x27;t load Requests.");
    expect(html).toContain('aria-label="New request"');
  });
});
