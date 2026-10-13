import { House } from "lucide-react";
import AdminSidebarNav from "@/components/admin/admin-sidebar-nav";
import AdminUserMenu from "@/components/admin/admin-user-menu";
import AppShell from "@/components/ui/app-shell";
import MobileTopBar from "@/components/ui/mobile-top-bar";
import NavItem from "@/components/ui/nav-item";
import ShellBrand from "@/components/ui/shell-brand";
import Sidebar from "@/components/ui/sidebar";
import type { ClientSummary } from "@/lib/auth/auth";

type AdminShellProps = {
  email: string;
  clients: Pick<ClientSummary, "id" | "name">[] | null;
  children: React.ReactNode;
};

export default function AdminShell({
  email,
  clients,
  children,
}: AdminShellProps): React.ReactNode {
  return (
    <AppShell
      sidebar={
        <Sidebar
          brand={
            <ShellBrand title="Neves Labs" subtitle="Admin" layout="stacked" />
          }
          footer={<AdminUserMenu email={email} placement="sidebar" />}
        >
          <AdminSidebarNav clients={clients} />
        </Sidebar>
      }
      mobileTopBar={
        <MobileTopBar
          brand={
            <ShellBrand title="Neves Labs" subtitle="Admin" layout="inline" />
          }
          action={<AdminUserMenu email={email} placement="mobile" />}
          nav={
            <NavItem variant="tab" to="/admin" end label="Home" icon={House} />
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
