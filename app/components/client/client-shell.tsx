import {
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Receipt,
  Users,
} from "lucide-react";
import ClientUserMenu from "@/components/client/client-user-menu";
import AdminPreviewMenu from "@/components/preview/admin-preview-menu";
import PreviewBanner from "@/components/preview/preview-banner";
import AppShell from "@/components/ui/app-shell";
import MobileTopBar from "@/components/ui/mobile-top-bar";
import NavItem from "@/components/ui/nav-item";
import ShellBrand from "@/components/ui/shell-brand";
import Sidebar from "@/components/ui/sidebar";
import { ClientPathsContext } from "@/hooks/use-client-paths";
import type { ClientAccess } from "@/lib/auth/auth";
import {
  CLIENT_PATHS,
  getPreviewPaths,
  type ClientPaths,
} from "@/lib/client-paths";
import { getProjectsPath } from "@/lib/link-board";

const BRAND_SUBTITLE = "Neves Labs · portal";
const TEAM_PATH = "/team";

// The Admin's read-only preview of this Client, as its Owner sees it.
export type ShellPreview = { clientId: string; isArchived: boolean };

type ClientShellProps = {
  clientName: string;
  // Null when the count couldn't load: the sidebar shows none.
  activeProjectCount: number | null;
  // Null when the count couldn't load: the sidebar shows none.
  newRequestCount: number | null;
  // Open and Overdue; null when the count couldn't load: the sidebar shows
  // none.
  openInvoiceCount: number | null;
  children: React.ReactNode;
} & (
  | {
      // The signed-in Client User, for the account menu.
      preview?: undefined;
      name: string;
      email: string;
      role: ClientAccess["role"];
    }
  | { preview: ShellPreview }
);

// The client area's shell, or the Admin preview's: the same nav (no Team in
// the preview), the preview's links, banner and "Admin preview" menu in
// place of the account menu. Everything inside links through its paths.
export default function ClientShell(props: ClientShellProps): React.ReactNode {
  const {
    clientName,
    activeProjectCount,
    newRequestCount,
    openInvoiceCount,
    children,
  } = props;
  const { preview } = props;
  const paths =
    preview === undefined ? CLIENT_PATHS : getPreviewPaths(preview.clientId);
  const brand = (
    <ShellBrand title={clientName} subtitle={BRAND_SUBTITLE} layout="stacked" />
  );
  const getMenu = (placement: "sidebar" | "mobile"): React.ReactNode =>
    props.preview === undefined ? (
      <ClientUserMenu
        clientName={clientName}
        name={props.name}
        email={props.email}
        role={props.role}
        placement={placement}
      />
    ) : (
      <AdminPreviewMenu
        placement={placement}
        clientName={clientName}
        exitHref={getProjectsPath(props.preview.clientId)}
      />
    );

  return (
    <ClientPathsContext value={paths}>
      <AppShell
        sidebar={
          <Sidebar brand={brand} footer={getMenu("sidebar")}>
            <ul className="flex flex-col gap-px">
              <li>
                <NavItem
                  to={paths.overview}
                  end
                  label="Overview"
                  icon={LayoutDashboard}
                />
              </li>
              <li>
                <NavItem
                  to={paths.projects}
                  label="Projects"
                  icon={FolderKanban}
                  count={activeProjectCount ?? undefined}
                  countLabel="active"
                />
              </li>
              <li>
                <NavItem
                  to={paths.invoices}
                  label="Invoices"
                  icon={Receipt}
                  count={openInvoiceCount ?? undefined}
                  countLabel="open"
                />
              </li>
              <li>
                <NavItem
                  to={paths.requests}
                  label="Requests"
                  icon={Inbox}
                  count={newRequestCount ?? undefined}
                  countLabel="new"
                />
              </li>
              {preview === undefined && (
                <li>
                  <NavItem to={TEAM_PATH} label="Team" icon={Users} />
                </li>
              )}
            </ul>
          </Sidebar>
        }
        mobileTopBar={
          <MobileTopBar
            brand={brand}
            action={getMenu("mobile")}
            nav={<MobileTabs paths={paths} hasTeam={preview === undefined} />}
          />
        }
      >
        {preview !== undefined && (
          <PreviewBanner
            clientName={clientName}
            isArchived={preview.isArchived}
            exitHref={getProjectsPath(preview.clientId)}
          />
        )}
        {children}
      </AppShell>
    </ClientPathsContext>
  );
}

function MobileTabs({
  paths,
  hasTeam,
}: {
  paths: ClientPaths;
  hasTeam: boolean;
}): React.ReactNode {
  return (
    <>
      <NavItem
        variant="tab"
        to={paths.overview}
        end
        label="Overview"
        icon={LayoutDashboard}
      />
      <NavItem
        variant="tab"
        to={paths.projects}
        label="Projects"
        icon={FolderKanban}
      />
      <NavItem
        variant="tab"
        to={paths.invoices}
        label="Invoices"
        icon={Receipt}
      />
      <NavItem
        variant="tab"
        to={paths.requests}
        label="Requests"
        icon={Inbox}
      />
      {hasTeam && (
        <NavItem variant="tab" to={TEAM_PATH} label="Team" icon={Users} />
      )}
    </>
  );
}
