import { data } from "react-router";
import { auth } from "@/lib/auth/auth.server";
import { requireAdmin } from "@/lib/auth/require-access.server";
import type { PreviewClient } from "@/lib/preview";

const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;

export type PreviewAccess = { client: PreviewClient; headers: Headers };

// The guard for every preview loader: the Admin, then the URL's Client
// (looked up as the Admin workspace does, through Better Auth's tables). A
// non-Admin is redirected home before anything is read; an unknown or
// malformed id is a 404. Callers put `headers` on their response.
export async function requirePreviewClient(
  request: Request,
  clientId: string,
): Promise<PreviewAccess> {
  const { headers } = await requireAdmin(request);
  const team = await auth.getTeam(clientId);
  if (team === null) throw data(null, { status: NOT_FOUND, headers });

  return {
    client: {
      clientId: team.clientId,
      clientName: team.name,
      isArchived: team.archivedAt !== null,
    },
    headers,
  };
}

// Every preview route's action: the preview never writes. The guard still
// runs first, so a non-Admin gets the usual redirect, not a 405.
export async function refusePreviewAction(request: Request): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw data(null, { status: METHOD_NOT_ALLOWED, headers });
}
