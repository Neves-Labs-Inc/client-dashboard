import { useRef } from "react";
import ArchivedClientRow, {
  ARCHIVED_TABLE_GRID_CLASS,
} from "@/components/admin/archived-client-row";
import DataTable from "@/components/ui/data-table";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import type { ArchivedClient } from "@/lib/auth/auth";

const COLUMNS = [
  { header: "Name" },
  { header: "Archived", align: "end" },
] as const;

type ArchivedClientsPanelProps = {
  // Sorted by name; null when they couldn't load.
  clients: ArchivedClient[] | null;
  // Takes focus after a successful retry that finds none (the panel is
  // then gone): the page's h1.
  fallbackFocusRef: React.RefObject<HTMLElement | null>;
};

// Home's "Archived" panel, the way in to archived Clients on mobile (the
// sidebar's group is md+). Hidden when there are none.
export default function ArchivedClientsPanel({
  clients,
  fallbackFocusRef,
}: ArchivedClientsPanelProps): React.ReactNode {
  // The same Panel in both states, so after a successful retry its heading
  // is still there to take focus.
  const titleRef = useRef<HTMLHeadingElement>(null);
  if (clients === null) {
    return (
      <Panel title="Archived" titleRef={titleRef}>
        <PanelError
          message="Couldn't load archived Clients."
          getReturnFocusTarget={() =>
            titleRef.current ?? fallbackFocusRef.current
          }
        />
      </Panel>
    );
  }
  if (clients.length === 0) return null;

  return (
    <Panel
      title="Archived"
      titleRef={titleRef}
      meta={`${clients.length} archived`}
    >
      <DataTable
        label="Archived Clients"
        columns={[...COLUMNS]}
        gridClassName={ARCHIVED_TABLE_GRID_CLASS}
      >
        {clients.map((client) => (
          <ArchivedClientRow key={client.id} client={client} />
        ))}
      </DataTable>
    </Panel>
  );
}
