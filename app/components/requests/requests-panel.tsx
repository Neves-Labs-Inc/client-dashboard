import { Suspense, useRef } from "react";
import { Await, Link } from "react-router";
import RequestTable from "@/components/requests/request-table";
import RequestTableSkeleton from "@/components/requests/request-table-skeleton";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import SkeletonGroup from "@/components/ui/skeleton-group";
import NewRequestLink from "@/components/requests/new-request-link";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { RequestRow } from "@/lib/requests/requests";

// The Overview shows this many; the loader asks for one more to know whether
// to offer "View all".
export const OVERVIEW_REQUEST_LIMIT = 5;

type RequestsPanelProps = {
  // Newest first, at most OVERVIEW_REQUEST_LIMIT + 1; null when they
  // couldn't load.
  requests: Promise<RequestRow[] | null>;
  highlightedId?: string | null;
  // Called when a trigger in the panel is clicked, so the page can send focus
  // back to it when the drawer closes.
  onOpenDrawer?: React.MouseEventHandler<HTMLAnchorElement>;
  // The Admin preview's: no "New" and no call to submit, as nothing can be.
  isReadOnly?: boolean;
};

export default function RequestsPanel({
  requests,
  highlightedId = null,
  onOpenDrawer,
  isReadOnly = false,
}: RequestsPanelProps): React.ReactNode {
  const paths = useClientPaths();
  // Focused after a successful retry: the error's "Try again" goes away.
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The header, title link and "+ New" show in every state, so a failed list
  // never blocks a submit.
  const newLink = isReadOnly ? undefined : (
    <NewRequestLink
      variant="secondary"
      label="New"
      ariaLabel="New request"
      onClick={onOpenDrawer}
    />
  );
  const renderPanel = (children: React.ReactNode): React.ReactNode => (
    <Panel
      title="Requests"
      titleHref={paths.requests}
      titleRef={titleRef}
      action={newLink}
    >
      {children}
    </Panel>
  );
  const error = renderPanel(
    <PanelError
      message="Couldn't load Requests."
      getReturnFocusTarget={() => titleRef.current}
    />,
  );

  return (
    <Suspense
      fallback={
        <RequestsPanelLoading titleHref={paths.requests} action={newLink} />
      }
    >
      <Await resolve={requests} errorElement={error}>
        {(resolved) => {
          if (resolved === null) return error;

          const shown = resolved.slice(0, OVERVIEW_REQUEST_LIMIT);
          return renderPanel(
            resolved.length === 0 ? (
              <NoRequests isReadOnly={isReadOnly} onOpenDrawer={onOpenDrawer} />
            ) : (
              <>
                <RequestTable
                  requests={shown}
                  highlightedId={highlightedId}
                  getHref={paths.getRequestPath}
                />
                {resolved.length > OVERVIEW_REQUEST_LIMIT && (
                  <Link
                    to={paths.requests}
                    aria-label="View all Requests"
                    className="flex min-h-10 w-full items-center border-t border-line px-3 text-[13px]/5 text-accent-fg transition-colors duration-(--dur-instant) hover:bg-surface-2 hover:underline focus-visible:-outline-offset-2 active:bg-surface-3 pointer-coarse:min-h-11"
                  >
                    View all
                  </Link>
                )}
              </>
            ),
          );
        }}
      </Await>
    </Suspense>
  );
}

function NoRequests({
  isReadOnly,
  onOpenDrawer,
}: Pick<RequestsPanelProps, "isReadOnly" | "onOpenDrawer">): React.ReactNode {
  // The client copy speaks to the Client; the preview's only reports.
  return isReadOnly ? (
    <EmptyState>No Requests yet.</EmptyState>
  ) : (
    <EmptyState
      action={
        <NewRequestLink
          variant="secondary"
          hasIcon={false}
          onClick={onOpenDrawer}
        />
      }
    >
      No Requests yet. Report a bug or ask for a feature.
    </EmptyState>
  );
}

function RequestsPanelLoading({
  titleHref,
  action,
}: {
  titleHref: string;
  action: React.ReactNode;
}): React.ReactNode {
  return (
    <Panel title="Requests" titleHref={titleHref} action={action}>
      <SkeletonGroup label="Requests">
        <RequestTableSkeleton />
      </SkeletonGroup>
    </Panel>
  );
}
