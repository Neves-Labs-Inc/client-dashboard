import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import ClientShell from "@/components/client/client-shell";
import { getClientPageSkeleton } from "@/components/client/client-page-skeleton";
import OverviewSkeleton from "@/components/client/overview-skeleton";
import RequestDetailSkeleton from "@/components/requests/request-detail-skeleton";
import RequestsPageSkeleton from "@/components/requests/requests-page-skeleton";
import type { RequestDetail, RequestRow } from "@/lib/requests/requests";
import PreviewRequestPage from "@/routes/preview/request";
import PreviewRequestsPage from "@/routes/preview/requests";

const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const PREVIEW = `/admin/clients/${CLIENT_ID}/preview`;
const SKELETON_ACTION_CLASS = "h-11 w-36 md:h-8 md:w-32";

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

const DETAIL: RequestDetail = {
  id: "r1",
  kind: "BUG",
  title: "Broken link",
  status: "NEW",
  submitterName: "Maya Chen",
  createdAt: new Date("2026-10-07"),
  description: "The footer link 404s.",
  statusChangedAt: new Date("2026-10-08"),
  responseNote: "We are on it.",
  project: { id: "p1", name: "Website" },
  task: {
    tracked: true,
    title: "Fix footer",
    clientStatus: "IN_PROGRESS",
    projectId: "p1",
    projectName: "Website",
  },
  canChange: false,
};

async function render(element: React.ReactNode, path: string): Promise<string> {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <ClientShell
            clientName="Acme"
            activeProjectCount={1}
            newRequestCount={2}
            openInvoiceCount={null}
            preview={{ clientId: CLIENT_ID, isArchived: false }}
          >
            {element}
          </ClientShell>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

type PageProps<Page extends (props: never) => React.ReactNode> =
  Parameters<Page>[0];

function requestsPage(requests: RequestRow[] | null): React.ReactNode {
  const props = {
    loaderData: { clientName: "Acme", requests },
  } as PageProps<typeof PreviewRequestsPage>;
  return <PreviewRequestsPage {...props} />;
}

function requestPage(detail: RequestDetail): React.ReactNode {
  const props = {
    loaderData: { clientName: "Acme", detail },
  } as PageProps<typeof PreviewRequestPage>;
  return <PreviewRequestPage {...props} />;
}

function getHrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe("the preview Requests page", () => {
  it("links rows to the preview Request detail and offers nothing to write", async () => {
    const html = await render(
      requestsPage(makeRequests(2)),
      `${PREVIEW}/requests?new=request`,
    );

    expect(getHrefs(html)).toContain(`${PREVIEW}/requests/r0`);
    expect(html).toContain("Request number 1");
    expect(html).not.toContain("New request");
    expect(html).not.toContain("?new=request");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('role="dialog"');
  });

  it("says only 'No Requests yet.' when empty, with no button", async () => {
    const html = await render(requestsPage([]), `${PREVIEW}/requests`);

    expect(html).toContain("<p>No Requests yet.</p>");
    expect(html).not.toContain("Report a bug");
    expect(html).not.toContain("New request");
  });

  it("shows the Panel error when the list is null", async () => {
    const html = await render(requestsPage(null), `${PREVIEW}/requests`);

    expect(html).toContain("Couldn&#x27;t load Requests.");
    expect(html).toContain("Try again");
  });

  it("marks Requests current in the nav", async () => {
    const html = await render(requestsPage([]), `${PREVIEW}/requests`);

    expect(html).toMatch(/aria-current="page"[^>]*>.*?Requests/);
  });
});

describe("the preview Request detail", () => {
  it("shows status, response and the live Task, linked under the preview", async () => {
    const html = await render(requestPage(DETAIL), `${PREVIEW}/requests/r1`);
    const hrefs = getHrefs(html);

    expect(html).toContain("We are on it.");
    expect(html).toContain("Fix footer");
    expect(hrefs).toContain(`${PREVIEW}/requests`);
    expect(
      hrefs.filter((href) => href === `${PREVIEW}/projects/p1`),
    ).toHaveLength(2);
  });

  it("shows a lost Task as no longer tracked", async () => {
    const html = await render(
      requestPage({
        ...DETAIL,
        task: { tracked: false, title: "Old task" },
      } as RequestDetail),
      `${PREVIEW}/requests/r1`,
    );

    expect(html).toContain("Old task");
    expect(html).toContain("(no longer tracked)");
  });

  it("has no Edit, Withdraw or form on a New Request", async () => {
    const html = await render(
      requestPage(DETAIL),
      `${PREVIEW}/requests/r1?edit=1`,
    );

    expect(html).not.toContain("Edit request");
    expect(html).not.toContain("Withdraw");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('role="dialog"');
  });
});

describe("the preview skeletons", () => {
  it("drops the action block from the Requests skeleton only when asked", async () => {
    const withAction = await render(<RequestsPageSkeleton />, PREVIEW);
    const without = await render(
      <RequestsPageSkeleton hasAction={false} />,
      PREVIEW,
    );

    expect(withAction).toContain(SKELETON_ACTION_CLASS);
    expect(without).not.toContain(SKELETON_ACTION_CLASS);
  });

  it("draws one button block on the detail skeleton when asked", async () => {
    const two = await render(<RequestDetailSkeleton />, PREVIEW);
    const one = await render(
      <RequestDetailSkeleton actionCount={1} />,
      PREVIEW,
    );

    expect(two).toContain("h-11 w-32 md:h-8 md:w-28");
    expect(one).toContain("h-11 w-28 md:h-8 md:w-24");
    expect(one).not.toContain("h-11 w-32 md:h-8 md:w-28");
  });

  it("draws no action placeholders on the read-only Overview skeleton", async () => {
    const client = await render(<OverviewSkeleton />, PREVIEW);
    const preview = await render(<OverviewSkeleton isReadOnly />, PREVIEW);

    expect(client).toContain("md:w-[118px]");
    expect(client).toContain("md:w-14");
    expect(preview).not.toContain("md:w-[118px]");
    expect(preview).not.toContain("md:w-14");
  });

  it("picks the read-only variants through the page skeleton lookup", async () => {
    const html = await render(
      <>
        {getClientPageSkeleton("requests", true)}
        {getClientPageSkeleton("overview", true)}
      </>,
      PREVIEW,
    );

    expect(html).not.toContain(SKELETON_ACTION_CLASS);
    expect(html).not.toContain("md:w-[118px]");
  });
});
