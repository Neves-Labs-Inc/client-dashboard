import { House, Inbox, Plus, Receipt } from "lucide-react";
import { Link, useLocation } from "react-router";
import ArchivedClientsDisclosure from "@/components/admin/archived-clients-disclosure";
import type { NavAlert } from "@/components/ui/nav-alert-icons";
import NavItem from "@/components/ui/nav-item";
import { INVOICES_COPY, INVOICES_PATH } from "@/lib/admin-invoices";
import { INBOX_PATH, REQUESTS_COPY } from "@/lib/admin-requests";
import type { ArchivedClient, ClientSummary } from "@/lib/auth/auth";
import {
  getCreatedClientId,
  getTeamPath,
  NEW_CLIENT_HREF,
} from "@/lib/new-client";

const LIST_CLASS = "flex flex-col gap-px";
const LABEL_ID = "nav-clients";

type AdminSidebarNavProps = {
  // Null when the roster failed to load; the shell stays up.
  clients: Pick<ClientSummary, "id" | "name">[] | null;
  // Null when they failed to load: the group is hidden (Home's panel
  // carries the error).
  archivedClients: Pick<ArchivedClient, "id" | "name">[] | null;
  // Active Clients with a sync-problem Project.
  syncProblemClientIds: string[];
  // New Requests by active Client; empty when they failed to load.
  newRequestCounts: Record<string, number>;
  // Active Clients with an Overdue Invoice.
  overdueInvoiceClientIds: string[];
  // Overdue Invoices of active Clients; 0 when it couldn't load.
  overdueInvoiceCount: number;
};

// The ids each alert is read from.
type ClientAlertSources = Pick<
  AdminSidebarNavProps,
  "newRequestCounts" | "syncProblemClientIds" | "overdueInvoiceClientIds"
>;

function getClientAlerts(
  clientId: string,
  sources: ClientAlertSources,
): NavAlert[] {
  const alerts: NavAlert[] = [];
  const newRequestCount = sources.newRequestCounts[clientId] ?? 0;
  if (newRequestCount > 0) {
    alerts.push({ kind: "new-requests", count: newRequestCount });
  }
  if (sources.syncProblemClientIds.includes(clientId)) {
    alerts.push({ kind: "sync-problem" });
  }
  if (sources.overdueInvoiceClientIds.includes(clientId)) {
    alerts.push({ kind: "overdue-invoice" });
  }
  return alerts;
}

// The children of the Sidebar's <nav aria-label="Main">.
export default function AdminSidebarNav({
  clients,
  archivedClients,
  syncProblemClientIds,
  newRequestCounts,
  overdueInvoiceClientIds,
  overdueInvoiceCount,
}: AdminSidebarNavProps): React.ReactNode {
  const { pathname, state } = useLocation();
  // Arriving from a create: that Client's entry gets the highlight fade.
  const createdClientId = getCreatedClientId(state);
  const newRequestTotal = Object.values(newRequestCounts).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <>
      <ul className={LIST_CLASS}>
        <li>
          <NavItem to="/admin" end label="Home" icon={House} />
        </li>
        <li>
          {/* Not `end`: it stays current on a Request's detail. */}
          <NavItem
            to={INBOX_PATH}
            label={REQUESTS_COPY.requests}
            icon={Inbox}
            count={newRequestTotal}
            countLabel="new"
          />
        </li>
        <li>
          {/* Not `end`: it stays current on an Invoice's detail. */}
          <NavItem
            to={INVOICES_PATH}
            label={INVOICES_COPY.invoices}
            icon={Receipt}
            count={overdueInvoiceCount}
            countLabel="overdue"
          />
        </li>
      </ul>
      <h2
        id={LABEL_ID}
        className="px-2 pt-4 pb-1 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase"
      >
        Clients
      </h2>
      {clients === null && (
        <p className="px-2 py-1.5 text-xs/4 text-fg-2">
          Couldn&apos;t load Clients.
        </p>
      )}
      <ul aria-labelledby={LABEL_ID} className={LIST_CLASS}>
        {(clients ?? []).map((client) => (
          <li key={client.id}>
            <NavItem
              to={getTeamPath(client.id)}
              label={client.name}
              active={pathname.startsWith(`/admin/clients/${client.id}/`)}
              isHighlighted={client.id === createdClientId}
              alerts={getClientAlerts(client.id, {
                newRequestCounts,
                syncProblemClientIds,
                overdueInvoiceClientIds,
              })}
            />
          </li>
        ))}
        <li>
          <Link
            to={NEW_CLIENT_HREF}
            className="flex min-h-8 items-center gap-2 rounded-[3px] px-2 py-1.5 text-[13px]/5 text-fg-2 transition-[color,background-color] duration-(--dur-instant) hover:bg-surface-2 hover:text-fg active:bg-surface-3 pointer-coarse:min-h-11"
          >
            <Plus size={14} aria-hidden="true" className="shrink-0" />
            New client
          </Link>
        </li>
      </ul>
      {archivedClients !== null && (
        <ArchivedClientsDisclosure clients={archivedClients} />
      )}
    </>
  );
}
