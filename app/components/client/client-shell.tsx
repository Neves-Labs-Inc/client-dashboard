import { Users } from "lucide-react";
import ClientUserMenu from "@/components/client/client-user-menu";
import AppShell from "@/components/ui/app-shell";
import MobileTopBar from "@/components/ui/mobile-top-bar";
import NavItem from "@/components/ui/nav-item";
import ShellBrand from "@/components/ui/shell-brand";
import Sidebar from "@/components/ui/sidebar";
import type { ClientAccess } from "@/lib/auth/auth";

const BRAND_SUBTITLE = "Neves Labs · portal";
const TEAM_PATH = "/team";

type ClientShellProps = {
  clientName: string;
  name: string;
  email: string;
  role: ClientAccess["role"];
  children: React.ReactNode;
};

export default function ClientShell({
  clientName,
  name,
  email,
  role,
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
            <NavItem variant="tab" to={TEAM_PATH} label="Team" icon={Users} />
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
