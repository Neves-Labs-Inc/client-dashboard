import { useRouteLoaderData } from "react-router";
import PageHeader from "@/components/ui/page-header";
import PanelError from "@/components/ui/panel-error";

const LAYOUT_ROUTE_ID = "routes/client/layout";

type ClientRouteErrorProps = {
  // The page's own title, kept above the error.
  title: string;
};

// The client area's route ErrorBoundary: it renders inside the layout's
// Outlet, so the shell stays up and the page keeps its header. Nothing about
// the error reaches the browser; the server already logged it. "Try again"
// revalidates the failed loader.
export default function ClientRouteError({
  title,
}: ClientRouteErrorProps): React.ReactNode {
  const layout = useRouteLoaderData<{ clientName: string }>(LAYOUT_ROUTE_ID);
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
