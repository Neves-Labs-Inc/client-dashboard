import ArchiveControl, {
  ArchiveStatus,
} from "@/components/admin/archive-control";
import ArchivedBadge from "@/components/admin/archived-badge";
import PreviewLink from "@/components/admin/preview-link";
import PageHeader from "@/components/ui/page-header";
import TabNav from "@/components/ui/tab-nav";
import type { ArchiveClient } from "@/hooks/use-archive-client";
import { getClientRequestsPath } from "@/lib/admin-requests";
import { getProjectsPath } from "@/lib/link-board";
import { getTeamPath } from "@/lib/new-client";

export const CLIENTS_CRUMB = { label: "Clients", href: "/admin" };

export type ClientWorkspace = {
  clientId: string;
  name: string;
  archivedAt: Date | null;
};

type ClientWorkspaceHeaderProps = {
  client: ClientWorkspace;
  tab: "projects" | "team" | "requests";
  archive: ArchiveClient;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  // An active Client's primary action before "Archive client".
  children?: React.ReactNode;
};

// A Client workspace's top, the same on every tab: breadcrumb, the name
// with its Archived badge, Preview and the archive control and its status,
// then the tabs.
export default function ClientWorkspaceHeader({
  client,
  tab,
  archive,
  titleRef,
  children,
}: ClientWorkspaceHeaderProps): React.ReactNode {
  const isArchived = client.archivedAt !== null;
  const archiveVariant = isArchived ? "archived" : "active";

  return (
    <>
      <PageHeader
        breadcrumb={[CLIENTS_CRUMB, { label: client.name }]}
        title={client.name}
        titleRef={titleRef}
        badge={
          isArchived && <ArchivedBadge isAnimated={archive.isJustArchived} />
        }
        action={
          <ArchiveControl
            variant={archiveVariant}
            archive={archive}
            secondaryAction={<PreviewLink clientId={client.clientId} />}
          >
            {children}
          </ArchiveControl>
        }
      />
      <ArchiveStatus
        variant={archiveVariant}
        clientName={client.name}
        archive={archive}
      />
      <TabNav
        label="Client sections"
        items={[
          {
            label: "Projects & boards",
            to: getProjectsPath(client.clientId),
            current: tab === "projects",
          },
          {
            label: "Team",
            to: getTeamPath(client.clientId),
            current: tab === "team",
          },
          {
            label: "Requests",
            to: getClientRequestsPath(client.clientId),
            current: tab === "requests",
          },
        ]}
      />
    </>
  );
}
