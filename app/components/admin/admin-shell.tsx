import { House, Inbox, Receipt } from "lucide-react";
import AdminSidebarNav from "@/components/admin/admin-sidebar-nav";
import AdminUserMenu from "@/components/admin/admin-user-menu";
import AppShell from "@/components/ui/app-shell";
import MobileTopBar from "@/components/ui/mobile-top-bar";
import NavItem from "@/components/ui/nav-item";
import ShellBrand from "@/components/ui/shell-brand";
import Sidebar from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { INVOICES_COPY, INVOICES_PATH } from "@/lib/admin-invoices";
import { INBOX_PATH, REQUESTS_COPY } from "@/lib/admin-requests";
import type { ArchivedClient, ClientSummary } from "@/lib/auth/auth";

type AdminShellProps = {
  email: string;
  clients: Pick<ClientSummary, "id" | "name">[] | null;
  archivedClients: Pick<ArchivedClient, "id" | "name">[] | null;
  syncProblemClientIds: string[];
  // New Requests by active Client.
  newRequestCounts: Record<string, number>;
  // Active Clients with an Overdue Invoice.
  overdueInvoiceClientIds: string[];
  // Overdue Invoices of active Clients; 0 when it couldn't load.
  overdueInvoiceCount: number;
  children: React.ReactNode;
};

export default function AdminShell({
  email,
  clients,
  archivedClients,
  syncProblemClientIds,
  newRequestCounts,
  overdueInvoiceClientIds,
  overdueInvoiceCount,
  children,
}: AdminShellProps): React.ReactNode {
  return (
    <TooltipProvider>
      <AppShell
        sidebar={
          <Sidebar
            brand={
              <ShellBrand
                title="Neves Labs"
                subtitle="Admin"
                layout="stacked"
              />
            }
            footer={<AdminUserMenu email={email} placement="sidebar" />}
          >
            <AdminSidebarNav
              clients={clients}
              archivedClients={archivedClients}
              syncProblemClientIds={syncProblemClientIds}
              newRequestCounts={newRequestCounts}
              overdueInvoiceClientIds={overdueInvoiceClientIds}
              overdueInvoiceCount={overdueInvoiceCount}
            />
          </Sidebar>
        }
        mobileTopBar={
          <MobileTopBar
            brand={
              <ShellBrand title="Neves Labs" subtitle="Admin" layout="inline" />
            }
            action={<AdminUserMenu email={email} placement="mobile" />}
            nav={
              // Counts are sidebar-only (DESIGN §6.2).
              <>
                <NavItem
                  variant="tab"
                  to="/admin"
                  end
                  label="Home"
                  icon={House}
                />
                <NavItem
                  variant="tab"
                  to={INBOX_PATH}
                  label={REQUESTS_COPY.requests}
                  icon={Inbox}
                />
                <NavItem
                  variant="tab"
                  to={INVOICES_PATH}
                  label={INVOICES_COPY.invoices}
                  icon={Receipt}
                />
              </>
            }
          />
        }
      >
        {children}
      </AppShell>
    </TooltipProvider>
  );
}
