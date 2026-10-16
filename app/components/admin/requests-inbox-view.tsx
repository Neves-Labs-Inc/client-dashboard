import { useLocation, useNavigation } from "react-router";
import AdminRequestsPanel from "@/components/admin/admin-requests-panel";
import PageHeader from "@/components/ui/page-header";
import TabNav from "@/components/ui/tab-nav";
import {
  getInboxFilter,
  getInboxRequestPath,
  INBOX_ALL_HREF,
  INBOX_PATH,
  REQUESTS_COPY,
  type InboxFilter,
} from "@/lib/admin-requests";
import type { AdminRequestRow } from "@/lib/requests/requests";

type RequestsInboxViewProps = {
  filter: InboxFilter;
  // Null when they couldn't load.
  rows: AdminRequestRow[] | null;
};

// The Admin's Requests across active Clients, New or All.
export default function RequestsInboxView({
  filter,
  rows,
}: RequestsInboxViewProps): React.ReactNode {
  const switchingTo = useSwitchingFilter();
  const shownFilter = switchingTo ?? filter;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: REQUESTS_COPY.requests }]}
        title={REQUESTS_COPY.inboxTitle}
      />
      <TabNav
        label={REQUESTS_COPY.filterLabel}
        items={[
          {
            label: REQUESTS_COPY.filterNew,
            to: INBOX_PATH,
            current: shownFilter === "new",
          },
          {
            label: REQUESTS_COPY.filterAll,
            to: INBOX_ALL_HREF,
            current: shownFilter === "all",
          },
        ]}
      />
      <AdminRequestsPanel
        variant="inbox"
        rows={rows}
        meta={getMeta(filter, rows)}
        emptyCopy={
          filter === "new" ? REQUESTS_COPY.emptyNew : REQUESTS_COPY.empty
        }
        getHref={getInboxRequestPath}
        isLoading={switchingTo !== null}
      />
    </>
  );
}

// The filter a same-page navigation is loading, so its tab shows current
// at once; null otherwise.
function useSwitchingFilter(): InboxFilter | null {
  const navigation = useNavigation();
  const { pathname, search } = useLocation();
  const target = navigation.location;
  const isSwitching =
    navigation.state === "loading" &&
    target !== undefined &&
    target.pathname === pathname &&
    target.search !== search;
  return isSwitching
    ? getInboxFilter(new URLSearchParams(target.search))
    : null;
}

// "3 new" or "12 total"; nothing at 0 or when the list failed.
function getMeta(
  filter: InboxFilter,
  rows: AdminRequestRow[] | null,
): string | undefined {
  if (rows === null || rows.length === 0) return undefined;

  return filter === "new" ? `${rows.length} new` : `${rows.length} total`;
}
