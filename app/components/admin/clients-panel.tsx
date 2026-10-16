import { Suspense, useRef } from "react";
import { Await } from "react-router";
import ClientRow from "@/components/admin/client-row";
import ClientRowSkeleton from "@/components/admin/client-row-skeleton";
import { TABLE_GRID_CLASS } from "@/components/admin/clients-grid";
import NewClientLink from "@/components/admin/new-client-link";
import DataTable from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import SkeletonGroup from "@/components/ui/skeleton-group";
import type { ClientSummary } from "@/lib/auth/auth";

const SKELETON_ROW_COUNT = 3;
const COLUMNS = [
  { header: "Name" },
  { header: "Owner" },
  { header: "Users", align: "end" },
  { header: "Created" },
] as const;

type ClientsPanelProps = {
  // Null when the roster couldn't load.
  clients: Promise<ClientSummary[] | null>;
  // Active Clients with a sync-problem Project.
  syncProblemClientIds: string[];
};

export default function ClientsPanel({
  clients,
  syncProblemClientIds,
}: ClientsPanelProps): React.ReactNode {
  // Focused after a successful retry: the error's "Try again" goes away.
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Suspense fallback={<ClientsPanelLoading />}>
      <Await resolve={clients}>
        {(resolved) =>
          resolved === null ? (
            <Panel title="Clients" titleRef={titleRef}>
              <PanelError
                message="Couldn't load Clients."
                getReturnFocusTarget={() => titleRef.current}
              />
            </Panel>
          ) : (
            <Panel
              title="Clients"
              titleRef={titleRef}
              meta={
                resolved.length > 0 ? `${resolved.length} active` : undefined
              }
            >
              {resolved.length === 0 ? (
                <EmptyState action={<NewClientLink variant="secondary" />}>
                  No Clients yet.
                </EmptyState>
              ) : (
                <DataTable
                  label="Clients"
                  columns={[...COLUMNS]}
                  gridClassName={TABLE_GRID_CLASS}
                >
                  {resolved.map((client) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      hasSyncProblem={syncProblemClientIds.includes(client.id)}
                    />
                  ))}
                </DataTable>
              )}
            </Panel>
          )
        }
      </Await>
    </Suspense>
  );
}

function ClientsPanelLoading(): React.ReactNode {
  return (
    <Panel title="Clients">
      <SkeletonGroup label="Clients">
        <DataTable
          label="Clients"
          columns={[...COLUMNS]}
          gridClassName={TABLE_GRID_CLASS}
        >
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <ClientRowSkeleton key={index} />
          ))}
        </DataTable>
      </SkeletonGroup>
    </Panel>
  );
}
