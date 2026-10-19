import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import ClientShell from "@/components/client/client-shell";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";
import type { RequestRow } from "@/lib/requests/requests";
import ClientOverviewPage from "@/routes/client/overview";
import PreviewOverviewPage from "@/routes/preview/overview";
import PreviewProjectPage from "@/routes/preview/project";
import PreviewProjectsPage from "@/routes/preview/projects";

const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const PREVIEW = `/admin/clients/${CLIENT_ID}/preview`;

const PROJECT: ProjectSummary = {
  id: "p1",
  name: "Website redesign",
  isPast: false,
  health: "ON_TRACK",
  latestUpdateAt: new Date("2026-10-07T16:00:00Z"),
  latestNote: "Homepage copy approved.",
  currentMilestone: null,
  taskCounts: { UP_NEXT: 1, IN_PROGRESS: 0, DONE: 2 },
};

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

// Waits for the streamed lists, so the resolved page is what we read.
async function render(element: React.ReactNode, path: string): Promise<string> {
  const router = createMemoryRouter([{ path: "*", element }], {
    initialEntries: [path],
  });
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  return new Response(stream).text();
}

function previewShell(
  children: React.ReactNode,
  isArchived = false,
): React.ReactNode {
  return (
    <ClientShell
      clientName="Acme"
      activeProjectCount={3}
      newRequestCount={2}
      preview={{ clientId: CLIENT_ID, isArchived }}
    >
      {children}
    </ClientShell>
  );
}

// Every href in the markup, in order.
function getHrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

// The first opening tag carrying `attribute`.
function getTag(html: string, attribute: string): string {
  const tag = html.match(new RegExp(`<[a-z]+[^>]*${attribute}[^>]*>`));
  return tag?.[0] ?? "";
}

// Page components get their loader data as props; nothing else is read.
type PageProps<Page extends (props: never) => React.ReactNode> =
  Parameters<Page>[0];

function overviewPage(
  projects: ProjectSummary[],
  requests: RequestRow[],
): React.ReactNode {
  const props = {
    loaderData: {
      clientName: "Acme",
      projects: Promise.resolve(projects),
      requests: Promise.resolve(requests),
    },
  } as PageProps<typeof PreviewOverviewPage>;
  return <PreviewOverviewPage {...props} />;
}

describe("the preview shell", () => {
  it("says whose preview it is and that it's read-only, once", async () => {
    const html = await render(previewShell(<p>page</p>), PREVIEW);

    expect(html).toContain('role="status" aria-label="Admin preview"');
    expect(html.match(/aria-label="Admin preview"/g)).toHaveLength(1);
    expect(html).toContain(
      'Previewing <span class="font-semibold">Acme</span> as an Owner · Read-only',
    );
    expect(html).not.toContain("Archived: its users");
  });

  it("adds the archived note for an archived Client", async () => {
    const html = await render(previewShell(<p>page</p>, true), PREVIEW);

    expect(html).toContain("Archived: its users can&#x27;t sign in");
  });

  it("exits to the Client's Projects & boards tab", async () => {
    const html = await render(previewShell(<p>page</p>), PREVIEW);

    expect(html).toMatch(
      new RegExp(
        `href="/admin/clients/${CLIENT_ID}/projects"[^>]*>.*?Exit preview`,
      ),
    );
  });

  it("links Overview, Projects and Requests under the preview, with no Team", async () => {
    const html = await render(previewShell(<p>page</p>), PREVIEW);

    expect(new Set(getHrefs(html))).toEqual(
      new Set([
        "#main",
        PREVIEW,
        `${PREVIEW}/projects`,
        `${PREVIEW}/requests`,
        `/admin/clients/${CLIENT_ID}/projects`,
      ]),
    );
    expect(html).not.toContain(">Team<");
    expect(html).toContain('aria-label="Projects, 3 active"');
    expect(html).toContain('aria-label="Requests, 2 new"');
  });

  it("has the Admin preview menu, not a Client User's", async () => {
    const html = await render(previewShell(<p>page</p>), PREVIEW);

    expect(html.match(/aria-label="Admin preview menu"/g)).toHaveLength(2);
    expect(html).not.toContain("Account menu");
    expect(html).not.toContain('action="/sign-out"');
  });

  it("marks only Overview current on the Overview", async () => {
    const html = await render(previewShell(<p>page</p>), PREVIEW);

    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-current="page"[^>]*>.*?Overview/);
  });
});

describe("the preview Overview", () => {
  it("links every Project, KPI and Request under the preview", async () => {
    const html = await render(
      previewShell(overviewPage([PROJECT], makeRequests(6))),
      PREVIEW,
    );
    const hrefs = getHrefs(html);

    expect(hrefs).toContain(`${PREVIEW}/projects/p1`);
    expect(hrefs).toContain(`${PREVIEW}/requests/r0`);
    expect(getTag(html, 'aria-label="View all Requests"')).toContain(
      `href="${PREVIEW}/requests"`,
    );
    expect(
      hrefs.every(
        (href) =>
          href.startsWith(PREVIEW) ||
          href === "#main" ||
          href === `/admin/clients/${CLIENT_ID}/projects`,
      ),
    ).toBe(true);
  });

  it("offers no New request, even in an empty Requests panel", async () => {
    const html = await render(
      previewShell(overviewPage([], [])),
      `${PREVIEW}?new=request`,
    );

    expect(html).toContain("<p>No Requests yet.</p>");
    expect(html).not.toContain("Report a bug");
    expect(html).not.toContain("New request");
    expect(html).not.toContain("?new=request");
    expect(html).not.toContain('role="dialog"');
  });
});

describe("the preview Projects and Project view", () => {
  it("links Project rows under the preview", async () => {
    const props = {
      loaderData: { clientName: "Acme", projects: Promise.resolve([PROJECT]) },
    } as PageProps<typeof PreviewProjectsPage>;

    const html = await render(
      previewShell(<PreviewProjectsPage {...props} />),
      `${PREVIEW}/projects`,
    );

    expect(getHrefs(html)).toContain(`${PREVIEW}/projects/p1`);
  });

  it("points the Project view's breadcrumb at the preview Projects", async () => {
    const props = {
      loaderData: {
        clientName: "Acme",
        project: {
          id: "p1",
          name: "Website redesign",
          isPast: false,
          latest: null,
          earlier: [],
          milestones: [],
          otherWork: null,
        },
      },
    } as unknown as PageProps<typeof PreviewProjectPage>;

    const html = await render(
      previewShell(<PreviewProjectPage {...props} />),
      `${PREVIEW}/projects/p1`,
    );

    expect(html).toMatch(
      new RegExp(`<a[^>]*href="${PREVIEW}/projects"[^>]*>Projects</a>`),
    );
  });
});

describe("the client shell", () => {
  it("still links the client routes, with Team and the account menu", async () => {
    const props = {
      loaderData: {
        clientName: "Acme",
        projects: Promise.resolve([PROJECT]),
        requests: Promise.resolve(makeRequests(6)),
        projectOptions: [],
      },
    } as unknown as PageProps<typeof ClientOverviewPage>;

    const html = await render(
      <ClientShell
        clientName="Acme"
        name="Maya Chen"
        email="maya@acme.test"
        role="owner"
        activeProjectCount={3}
        newRequestCount={2}
      >
        <ClientOverviewPage {...props} />
      </ClientShell>,
      "/overview",
    );
    const hrefs = getHrefs(html);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/overview",
        "/projects",
        "/requests",
        "/team",
        "/projects/p1",
        "/requests/r0",
        "/overview?new=request",
      ]),
    );
    expect(hrefs.some((href) => href.startsWith("/admin"))).toBe(false);
    expect(html).toContain("Account menu, Maya Chen");
    expect(html).not.toContain('aria-label="Admin preview"');
  });
});
