import { FolderKanban, LayoutDashboard, Users } from "lucide-react";
import ClientUserMenu from "@/components/client/client-user-menu";
import AppShell from "@/components/ui/app-shell";
import MobileTopBar from "@/components/ui/mobile-top-bar";
import NavItem from "@/components/ui/nav-item";
import ShellBrand from "@/components/ui/shell-brand";
import Sidebar from "@/components/ui/sidebar";
import type { ClientAccess } from "@/lib/auth/auth";

const BRAND_SUBTITLE = "Neves Labs · portal";
const OVERVIEW_PATH = "/overview";
const TEAM_PATH = "/team";
const PROJECTS_PATH = "/projects";

type ClientShellProps = {
  clientName: string;
  name: string;
  email: string;
  role: ClientAccess["role"];
  // Null when the count couldn't load: the sidebar shows none.
  activeProjectCount: number | null;
  children: React.ReactNode;
};

export default function ClientShell({
  clientName,
  name,
  email,
  role,
  activeProjectCount,
  children,
}: ClientShellProps): React.ReactNode {
  const brand = (
    <ShellBrand title={clientName} subtitle={BRAND_SUBTITLE} layout="stacked" />
  );
  const user = { clientName, name, email, role };

  return (
    <AppShell
      sidebar={
        <Sidebar
          brand={brand}
          footer={<ClientUserMenu {...user} placement="sidebar" />}
        >
          <ul className="flex flex-col gap-px">
            <li>
              <NavItem
                to={OVERVIEW_PATH}
                label="Overview"
                icon={LayoutDashboard}
              />
            </li>
            <li>
              <NavItem
                to={PROJECTS_PATH}
                label="Projects"
                icon={FolderKanban}
                count={activeProjectCount ?? undefined}
                countLabel="active"
              />
            </li>
            <li>
              <NavItem to={TEAM_PATH} label="Team" icon={Users} />
            </li>
          </ul>
        </Sidebar>
      }
      mobileTopBar={
        <MobileTopBar
          brand={brand}
          action={<ClientUserMenu {...user} placement="mobile" />}
          nav={
            <>
              <NavItem
                variant="tab"
                to={OVERVIEW_PATH}
                label="Overview"
                icon={LayoutDashboard}
              />
              <NavItem
                variant="tab"
                to={PROJECTS_PATH}
                label="Projects"
                icon={FolderKanban}
              />
              <NavItem variant="tab" to={TEAM_PATH} label="Team" icon={Users} />
            </>
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
