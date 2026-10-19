import { REQUESTS_PATH } from "@/lib/request-drawer";

const OVERVIEW_PATH = "/overview";
const PROJECTS_SEGMENT = "/projects";

// Where the client pages live: the client area's own routes, or the Admin
// preview's read-only copy of them under one Client. Components link through
// these, so the same page works in both.
export type ClientPaths = {
  overview: string;
  projects: string;
  requests: string;
  getProjectPath: (projectId: string) => string;
  getRequestPath: (requestId: string) => string;
};

// The client pages both areas have, for picking a page's skeleton.
export type ClientPage =
  "overview" | "projects" | "project" | "requests" | "request";

function buildClientPaths(basePath: string, overview: string): ClientPaths {
  const projects = `${basePath}${PROJECTS_SEGMENT}`;
  const requests = `${basePath}${REQUESTS_PATH}`;
  return {
    overview,
    projects,
    requests,
    getProjectPath: (projectId) => `${projects}/${projectId}`,
    getRequestPath: (requestId) => `${requests}/${requestId}`,
  };
}

export const CLIENT_PATHS: ClientPaths = buildClientPaths("", OVERVIEW_PATH);

// The Admin's preview of a Client: its Overview, and the base of every other
// preview page.
export function getPreviewPath(clientId: string): string {
  return `/admin/clients/${clientId}/preview`;
}

export function getPreviewPaths(clientId: string): ClientPaths {
  const previewPath = getPreviewPath(clientId);
  return buildClientPaths(previewPath, previewPath);
}

// Which client page a pathname is, under these paths; null for any other.
export function getClientPage(
  pathname: string,
  paths: ClientPaths,
): ClientPage | null {
  let page: ClientPage | null = null;
  if (pathname === paths.overview) {
    page = "overview";
  } else if (pathname === paths.projects) {
    page = "projects";
  } else if (pathname === paths.requests) {
    page = "requests";
  } else if (isChildOf(pathname, paths.projects)) {
    page = "project";
  } else if (isChildOf(pathname, paths.requests)) {
    page = "request";
  }
  return page;
}

// One segment under `parent` (/projects/<id>), not deeper.
function isChildOf(pathname: string, parent: string): boolean {
  const prefix = `${parent}/`;
  if (!pathname.startsWith(prefix)) return false;

  const rest = pathname.slice(prefix.length);
  return rest !== "" && !rest.includes("/");
}
