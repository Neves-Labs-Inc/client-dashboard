import { Suspense, useRef } from "react";
import { Await, Link } from "react-router";
import RequestTable from "@/components/requests/request-table";
import RequestTableSkeleton from "@/components/requests/request-table-skeleton";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import SkeletonGroup from "@/components/ui/skeleton-group";
import NewRequestLink from "@/components/requests/new-request-link";
import { getRequestPath, REQUESTS_PATH } from "@/lib/request-drawer";
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
};

export default function RequestsPanel({
  requests,
  highlightedId = null,
  onOpenDrawer,
}: RequestsPanelProps): React.ReactNode {
  // Focused after a successful retry: the error's "Try again" goes away.
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The header, title link and "+ New" show in every state, so a failed list
  // never blocks a submit.
  const newLink = (
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
      titleHref={REQUESTS_PATH}
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
    <Suspense fallback={<RequestsPanelLoading onOpenDrawer={onOpenDrawer} />}>
      <Await resolve={requests} errorElement={error}>
        {(resolved) => {
          if (resolved === null) return error;

          const shown = resolved.slice(0, OVERVIEW_REQUEST_LIMIT);
          return renderPanel(
            resolved.length === 0 ? (
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
            ) : (
              <>
                <RequestTable
                  requests={shown}
                  highlightedId={highlightedId}
                  getHref={getRequestPath}
                />
                {resolved.length > OVERVIEW_REQUEST_LIMIT && (
                  <Link
                    to={REQUESTS_PATH}
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

function RequestsPanelLoading({
  onOpenDrawer,
}: Pick<RequestsPanelProps, "onOpenDrawer">): React.ReactNode {
  return (
    <Panel
      title="Requests"
      titleHref={REQUESTS_PATH}
      action={
        <NewRequestLink
          variant="secondary"
          label="New"
          ariaLabel="New request"
          onClick={onOpenDrawer}
        />
      }
    >
      <SkeletonGroup label="Requests">
        <RequestTableSkeleton />
      </SkeletonGroup>
    </Panel>
  );
}
