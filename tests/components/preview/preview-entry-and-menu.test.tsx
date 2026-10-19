import { renderToReadableStream } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import ClientWorkspaceHeader, {
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import AdminPreviewMenu from "@/components/preview/admin-preview-menu";
import type { ArchiveClient } from "@/hooks/use-archive-client";

// The menu's content lives in a Radix portal, which a server render never
// opens; inline here so the items it composes can be read.
vi.mock("@/components/ui/menu", () => ({
  default: ({
    trigger,
    children,
  }: {
    trigger: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {trigger}
      <div data-testid="menu-content">{children}</div>
    </div>
  ),
}));
vi.mock("radix-ui", async (importOriginal) => {
  const radix = await importOriginal<typeof import("radix-ui")>();
  // Items and the theme radio group outside a Root render as plain markup.
  const passThrough = ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>;
  return {
    ...radix,
    DropdownMenu: new Proxy(radix.DropdownMenu, {
      get: () => passThrough,
    }),
  };
});

const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const EXIT_HREF = `/admin/clients/${CLIENT_ID}/projects`;

async function render(element: React.ReactNode): Promise<string> {
  const router = createMemoryRouter([{ path: "*", element }]);
  const stream = await renderToReadableStream(
    <RouterProvider router={router} />,
  );
  await stream.allReady;
  // Text joined across JSX expressions, without React's <!-- --> markers.
  return (await new Response(stream).text()).replaceAll("<!-- -->", "");
}

const ARCHIVE: ArchiveClient = {
  isConfirming: false,
  confirmId: "confirm",
  isBusy: false,
  isArchiving: false,
  isUnarchiving: false,
  error: null,
  failedIntent: null,
  isJustArchived: false,
  triggerRef: { current: null },
  handleStartArchive: () => {},
  handleKeep: () => {},
  handleArchive: () => {},
  handleUnarchive: () => {},
  handleConfirmKeyDown: () => {},
};

function header(
  client: ClientWorkspace,
  tab: "projects" | "team" | "requests",
  children?: React.ReactNode,
): React.ReactNode {
  return (
    <ClientWorkspaceHeader
      client={client}
      tab={tab}
      archive={ARCHIVE}
      titleRef={{ current: null }}
    >
      {children}
    </ClientWorkspaceHeader>
  );
}

const ACTIVE: ClientWorkspace = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
};
const ARCHIVED: ClientWorkspace = {
  ...ACTIVE,
  archivedAt: new Date("2026-10-01"),
};

describe("the Admin preview menu", () => {
  it("names the preview and its Client, with the theme toggle and Exit preview", async () => {
    const html = await render(
      <AdminPreviewMenu
        placement="sidebar"
        clientName="Acme"
        exitHref={EXIT_HREF}
      />,
    );
    const content = html.slice(html.indexOf('data-testid="menu-content"'));

    expect(html).toContain('aria-label="Admin preview menu"');
    expect(content).toContain("Admin preview");
    expect(content).toContain("Viewing Acme as an Owner");
    expect(content).toMatch(/Theme/);
    expect(content).toMatch(
      new RegExp(`href="${EXIT_HREF}"[^>]*>.*?Exit preview`),
    );
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("Profile");
    expect(html).not.toContain('action="/sign-out"');
    // No initials: the tile is an icon.
    expect(html).not.toContain("bg-accent");
  });
});

describe("the Client workspace header", () => {
  for (const tab of ["projects", "team", "requests"] as const) {
    it(`offers Preview on the ${tab} tab, before Archive client`, async () => {
      const html = await render(header(ACTIVE, tab));
      const previewAt = html.indexOf(
        `href="/admin/clients/${CLIENT_ID}/preview"`,
      );

      expect(previewAt).toBeGreaterThan(-1);
      expect(previewAt).toBeLessThan(html.indexOf("Archive client"));
      expect(html).not.toMatch(/target="_blank"/);
    });
  }

  it("puts Preview after the primary action", async () => {
    const html = await render(
      header(ACTIVE, "team", <button type="button">Invite first Owner</button>),
    );

    expect(html.indexOf("Invite first Owner")).toBeLessThan(
      html.indexOf(">Preview<"),
    );
  });

  it("offers Preview for an archived Client, before Unarchive", async () => {
    const html = await render(header(ARCHIVED, "projects"));
    const previewAt = html.indexOf(">Preview<");

    expect(previewAt).toBeGreaterThan(-1);
    expect(previewAt).toBeLessThan(html.indexOf("Unarchive"));
  });
});
