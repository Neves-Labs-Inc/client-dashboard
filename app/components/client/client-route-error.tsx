import {
  isRouteErrorResponse,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import ClientRouteNotFound from "@/components/client/client-route-not-found";
import PageHeader from "@/components/ui/page-header";
import PanelError from "@/components/ui/panel-error";

const CLIENT_LAYOUT_ROUTE_ID = "routes/client/layout";
const NOT_FOUND = 404;

type ClientRouteErrorProps = {
  // The page's own title, kept above the error.
  title: string;
  // A page that 404s (an unknown id) shows this instead of the generic error.
  notFound?: { title: string; backHref: string; backLabel: string };
  // The layout whose data names the Client (the Admin preview's has its own).
  layoutRouteId?: string;
};

// The client area's route ErrorBoundary: it renders inside the layout's
// Outlet, so the shell stays up and the page keeps its header. Nothing about
// the error reaches the browser; the server already logged it. "Try again"
// revalidates the failed loader.
export default function ClientRouteError({
  title,
  notFound,
  layoutRouteId = CLIENT_LAYOUT_ROUTE_ID,
}: ClientRouteErrorProps): React.ReactNode {
  const error = useRouteError();
  const layout = useRouteLoaderData<{ clientName: string }>(layoutRouteId);
  const isNotFound = isRouteErrorResponse(error) && error.status === NOT_FOUND;
  if (notFound && isNotFound) {
    return (
      <ClientRouteNotFound
        clientName={layout?.clientName ?? null}
        sectionTitle={title}
        {...notFound}
      />
    );
  }

  const breadcrumb = layout
    ? [{ label: layout.clientName, isTruncated: true }, { label: title }]
    : [{ label: title }];

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader breadcrumb={breadcrumb} title={title} />
      <div className="rounded-[3px] border border-line bg-surface">
        <PanelError message="Couldn't load this page." />
      </div>
    </div>
  );
}
