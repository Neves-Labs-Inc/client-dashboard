import { useRef } from "react";
import AdminRequestsPanel from "@/components/admin/admin-requests-panel";
import ClientWorkspaceHeader, {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { getClientRequestPath, REQUESTS_COPY } from "@/lib/admin-requests";
import { getTeamPath } from "@/lib/new-client";
import type { RequestRow } from "@/lib/requests/requests";

type ClientRequestsViewProps = {
  clientId: string;
  // Null when they couldn't load.
  client: ClientWorkspace | null;
  rows: RequestRow[] | null;
};

// A Client's Requests tab, every status, archived Clients included.
export default function ClientRequestsView({
  clientId,
  client,
  rows,
}: ClientRequestsViewProps): React.ReactNode {
  if (client === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[CLIENTS_CRUMB]}
          title={REQUESTS_COPY.requests}
        />
        <Panel title={REQUESTS_COPY.requests}>
          <PanelError message={REQUESTS_COPY.loadFailed} />
        </Panel>
      </>
    );
  }

  return <WorkspaceRequests clientId={clientId} client={client} rows={rows} />;
}

function WorkspaceRequests({
  clientId,
  client,
  rows,
}: {
  clientId: string;
  client: ClientWorkspace;
  rows: RequestRow[] | null;
}): React.ReactNode {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Archive and unarchive post to the Team route, which owns them.
  const archive = useArchiveClient({
    clientName: client.name,
    action: getTeamPath(client.clientId),
    titleRef,
  });
  const newCount = rows?.filter((row) => row.status === "NEW").length ?? 0;

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="requests"
        archive={archive}
        titleRef={titleRef}
      />
      <AdminRequestsPanel
        variant="client"
        rows={rows}
        meta={newCount > 0 ? `${newCount} new` : undefined}
        emptyCopy={REQUESTS_COPY.empty}
        getHref={(requestId) => getClientRequestPath(clientId, requestId)}
      />
    </>
  );
}
