import {
  data,
  isRouteErrorResponse,
  Outlet,
  useRouteError,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { getClientPageSkeleton } from "@/components/client/client-page-skeleton";
import ClientShell from "@/components/client/client-shell";
import PreviewRouteError from "@/components/preview/preview-route-error";
import { useNavigatingToPath } from "@/hooks/use-navigating-to-path";
import { getClientPage, getPreviewPaths } from "@/lib/client-paths";
import { clientProjects } from "@/lib/client-projects/client-projects.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/layout";

const NOT_FOUND = 404;
const NOT_FOUND_TITLE = "Not found · Neves Labs";
const ERROR_TITLE = "Preview · Neves Labs";

// The pages set their own title; this one shows when the layout failed.
export function meta({ error }: Route.MetaArgs): Route.MetaDescriptors {
  const isNotFound = isRouteErrorResponse(error) && error.status === NOT_FOUND;
  return [{ title: isNotFound ? NOT_FOUND_TITLE : ERROR_TITLE }];
}

// Guards every preview page. Child routes still call requirePreviewClient in
// their own loaders: this loader runs alongside theirs, not before. Tenant
// data comes from the client read models, scoped by the URL's Client and no
// user, so RLS shows exactly what its Owner sees and refuses any write.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const { clientId } = client;
  const [activeProjectCount, newRequestCount] = await Promise.all([
    loadNavCount("the active Projects", clientId, () =>
      clientProjects.countActiveProjects(clientId),
    ),
    loadNavCount("the New Requests", clientId, () =>
      requests.countNewRequests(clientId),
    ),
  ]);
  return data({ ...client, activeProjectCount, newRequestCount }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

// The nav counts are a nicety: when one fails the shell still renders,
// without it. Only the error's name and code are logged.
async function loadNavCount(
  what: string,
  clientId: string,
  count: () => Promise<number>,
): Promise<number | null> {
  let total: number | null = null;
  try {
    total = await count();
  } catch (error) {
    console.error(`preview: couldn't count ${what} (${describeError(error)})`, {
      clientId,
    });
  }
  return total;
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export function ErrorBoundary(): React.ReactNode {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === NOT_FOUND;
  return <PreviewRouteError isNotFound={isNotFound} />;
}

export default function PreviewLayout({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { clientId, clientName, isArchived } = loaderData;
  const loadingPath = useNavigatingToPath();
  const page =
    loadingPath === null
      ? null
      : getClientPage(loadingPath, getPreviewPaths(clientId));

  // No welcome toast and no drawer: the preview is read-only chrome.
  return (
    <ClientShell
      clientName={clientName}
      activeProjectCount={loaderData.activeProjectCount}
      newRequestCount={loaderData.newRequestCount}
      preview={{ clientId, isArchived }}
    >
      {getClientPageSkeleton(page) ?? <Outlet />}
    </ClientShell>
  );
}
