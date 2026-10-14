import { ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useLocation } from "react-router";
import NavItem from "@/components/ui/nav-item";
import type { ArchivedClient } from "@/lib/auth/auth";
import { getTeamPath } from "@/lib/new-client";
import { cn } from "@/lib/utils";

type ArchivedClientsDisclosureProps = {
  // Sorted by name. Hidden when empty.
  clients: Pick<ArchivedClient, "id" | "name">[];
};

// The sidebar's collapsed "Archived" group, under the Clients list. Open
// while the page is an archived Client's (rendered open on the server too,
// so there's no flash); otherwise the Admin opens and closes it.
export default function ArchivedClientsDisclosure({
  clients,
}: ArchivedClientsDisclosureProps): React.ReactNode {
  const { pathname } = useLocation();
  const listId = useId();
  const isActive = (clientId: string): boolean =>
    pathname.startsWith(`/admin/clients/${clientId}/`);
  const isViewingArchived = clients.some((client) => isActive(client.id));
  const [isOpen, setIsOpen] = useState(isViewingArchived);
  // The list fades in only when the Admin opens it, not when it renders
  // open (SSR, or arriving on an archived Client).
  const [isOpenedByAdmin, setIsOpenedByAdmin] = useState(false);

  // Navigating into an archived Client (or archiving the one on screen)
  // opens it; leaving keeps whatever the Admin chose.
  useEffect(() => {
    if (isViewingArchived) setIsOpen(true);
  }, [pathname, isViewingArchived]);

  if (clients.length === 0) return null;

  function handleToggle(): void {
    setIsOpenedByAdmin(!isOpen);
    setIsOpen(!isOpen);
  }

  return (
    <>
      {/* pt-2.5 plus the button's py-1.5 lines up with the Clients label. */}
      <h2 className="pt-2.5">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={handleToggle}
          className="flex min-h-8 w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase transition-[color,background-color] duration-(--dur-instant) hover:bg-surface-2 hover:text-fg active:bg-surface-3 pointer-coarse:min-h-11"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={cn(
              "shrink-0 transition-transform duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
              isOpen && "rotate-90",
            )}
          />
          Archived
          <span className="ml-auto font-mono text-xs/4 normal-case tabular-nums">
            {clients.length}
          </span>
        </button>
      </h2>
      <ul
        id={listId}
        hidden={!isOpen}
        className={cn(
          "flex flex-col gap-px",
          isOpenedByAdmin &&
            "animate-in duration-(--dur-base) fade-in-0 motion-reduce:duration-(--dur-instant)",
        )}
      >
        {clients.map((client) => (
          <li key={client.id}>
            <NavItem
              to={getTeamPath(client.id)}
              label={client.name}
              active={isActive(client.id)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
