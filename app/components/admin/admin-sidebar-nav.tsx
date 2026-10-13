import { House, Plus } from "lucide-react";
import { Link, useLocation } from "react-router";
import { NEW_CLIENT_HREF } from "@/components/admin/new-client-link";
import NavItem from "@/components/ui/nav-item";
import type { ClientSummary } from "@/lib/auth/auth";

const LIST_CLASS = "flex flex-col gap-px";
const LABEL_ID = "nav-clients";

type AdminSidebarNavProps = {
  // Null when the roster failed to load; the shell stays up.
  clients: Pick<ClientSummary, "id" | "name">[] | null;
};

// The children of the Sidebar's <nav aria-label="Main">.
export default function AdminSidebarNav({
  clients,
}: AdminSidebarNavProps): React.ReactNode {
  const { pathname } = useLocation();

  return (
    <>
      <ul className={LIST_CLASS}>
        <li>
          <NavItem to="/admin" end label="Home" icon={House} />
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
              to={`/admin/clients/${client.id}/team`}
              label={client.name}
              active={pathname.startsWith(`/admin/clients/${client.id}/`)}
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
    </>
  );
}
