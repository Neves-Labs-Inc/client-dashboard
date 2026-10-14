import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigation,
  useSearchParams,
} from "react-router";
import ClientWorkspaceHeader, {
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import MapColumnsDrawer from "@/components/admin/map-columns-drawer";
import ProjectRow from "@/components/admin/project-row";
import ProjectsTable from "@/components/admin/projects-table";
import { buttonStyles } from "@/components/ui/button-styles";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import type {
  ProjectRow as Project,
  SaveMappingError,
} from "@/lib/board-sync/board-sync";
import { clearHistoryState } from "@/lib/history-state";
import { getLinkedProject, getProjectsPath, LINK_COPY } from "@/lib/link-board";
import { getTeamPath } from "@/lib/new-client";
import { MAP_PARAM, PROJECTS_COPY, type MapLoad } from "@/lib/projects";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ProjectsViewProps = {
  client: ClientWorkspace;
  // Null when they couldn't load.
  projects: Project[] | null;
  // The loader's mapping for `?map=`; null without it.
  mapLoad: MapLoad | null;
  isGithubConnected: boolean;
};

export default function ProjectsView({
  client,
  projects,
  mapLoad,
  isGithubConnected,
}: ProjectsViewProps): React.ReactNode {
  const { state } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const linked = getLinkedProject(state);
  const { highlightedId, highlight } = useRowHighlight(
    linked?.linkedProjectId ?? null,
  );
  const handledLinkRef = useRef<string | null>(null);
  // Archive and unarchive post to the Team route, which owns them.
  const archive = useArchiveClient({
    clientName: client.name,
    action: getTeamPath(client.clientId),
    titleRef,
  });
  const isArchived = client.archivedAt !== null;
  const canSync = isGithubConnected && !isArchived;
  const projectsPath = getProjectsPath(client.clientId);
  const map = useMapDrawer(projects, mapLoad, isArchived, highlight);

  // Arriving from a link, the drawer's trigger is gone: focus the h1 and
  // confirm. The marker leaves the history entry, so a reload doesn't
  // replay it.
  useEffect(() => {
    if (linked === null) return;
    if (handledLinkRef.current === linked.linkedProjectId) return;

    handledLinkRef.current = linked.linkedProjectId;
    titleRef.current?.focus();
    clearHistoryState();
    toast(
      linked.firstSyncFailed ? LINK_COPY.linkedSyncFailed : LINK_COPY.linked,
    );
  }, [linked]);

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="projects"
        archive={archive}
        titleRef={titleRef}
      />
      <Panel
        title="Projects"
        titleRef={panelTitleRef}
        meta={projects === null ? undefined : getMeta(projects)}
      >
        {projects === null && (
          <PanelError
            message={PROJECTS_COPY.loadFailed}
            getReturnFocusTarget={() => panelTitleRef.current}
          />
        )}
        {projects?.length === 0 && (
          <EmptyState action={isArchived ? undefined : <LinkFromHome />}>
            {PROJECTS_COPY.empty}
          </EmptyState>
        )}
        {projects !== null && projects.length > 0 && (
          <ProjectsTable>
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                canSync={canSync}
                canMap={!isArchived}
                action={projectsPath}
                isHighlighted={project.id === highlightedId}
                onSynced={highlight}
              />
            ))}
          </ProjectsTable>
        )}
      </Panel>
      {projects !== null && (
        <MapColumnsDrawer
          {...map}
          action={projectsPath}
          fallbackFocusRef={titleRef}
        />
      )}
    </>
  );
}

type MapDrawerProps = Pick<
  React.ComponentProps<typeof MapColumnsDrawer>,
  | "open"
  | "onOpenChange"
  | "projectId"
  | "projectName"
  | "mapping"
  | "unavailable"
  | "onSaved"
>;

// The Map columns drawer's state from the URL: open as soon as a navigation
// to `?map=` starts (the mapping loads meanwhile), and its Project kept
// while the drawer animates out.
function useMapDrawer(
  projects: Project[] | null,
  mapLoad: MapLoad | null,
  isArchived: boolean,
  highlight: (id: string) => void,
): MapDrawerProps {
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const location = useLocation();
  const [shownId, setShownId] = useState<string | null>(null);
  const target = navigation.location ?? location;
  const requestedId =
    target.pathname === location.pathname
      ? new URLSearchParams(target.search).get(MAP_PARAM)
      : null;
  if (requestedId !== null && requestedId !== shownId) setShownId(requestedId);

  const project = projects?.find((row) => row.id === shownId);
  const isOpening = requestedId !== null && navigation.state === "loading";
  const loadedMapping =
    mapLoad?.projectId === shownId && !isOpening ? mapLoad.mapping : undefined;

  function handleOpenChange(open: boolean): void {
    if (open) return;

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(MAP_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  function handleSaved(projectId: string): void {
    highlight(projectId);
    handleOpenChange(false);
  }

  return {
    open: requestedId !== null,
    onOpenChange: handleOpenChange,
    projectId: shownId,
    projectName: project?.name ?? null,
    mapping: loadedMapping,
    unavailable: getUnavailable(project, isArchived),
    onSaved: handleSaved,
  };
}

function getUnavailable(
  project: Project | undefined,
  isArchived: boolean,
): SaveMappingError | null {
  if (isArchived) return "archived";

  return project?.state === "unlinked" ? "unlinked" : null;
}

function LinkFromHome(): React.ReactNode {
  return (
    <Link
      to="/admin"
      className={cn(
        buttonStyles({ variant: "secondary" }),
        "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      <Link2 size={14} aria-hidden="true" />
      {PROJECTS_COPY.linkFromHome}
    </Link>
  );
}

// "2 linked · 1 unlinked"; closed on GitHub counts as linked.
function getMeta(projects: Project[]): string | undefined {
  if (projects.length === 0) return undefined;

  const unlinked = projects.filter((row) => row.state === "unlinked").length;
  const linkedLabel = `${projects.length - unlinked} linked`;
  return unlinked > 0 ? `${linkedLabel} · ${unlinked} unlinked` : linkedLabel;
}
