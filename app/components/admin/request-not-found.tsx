import { CLIENTS_CRUMB } from "@/components/admin/client-workspace-header";
import RequestBackLink from "@/components/admin/request-back-link";
import PageHeader from "@/components/ui/page-header";
import {
  getClientRequestsPath,
  INBOX_PATH,
  REQUESTS_COPY,
} from "@/lib/admin-requests";

type RequestNotFoundProps =
  { route: "inbox" } | { route: "client"; clientId: string };

// The 404 in the main column. Nothing here confirms the Request exists
// under another Client.
export default function RequestNotFound(
  props: RequestNotFoundProps,
): React.ReactNode {
  const isInbox = props.route === "inbox";
  const listPath = isInbox ? INBOX_PATH : getClientRequestsPath(props.clientId);
  const listCrumb = { label: REQUESTS_COPY.requests, href: listPath };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={isInbox ? [listCrumb] : [CLIENTS_CRUMB, listCrumb]}
        title={REQUESTS_COPY.notFound}
      />
      <p className="text-[13px]/5 text-fg-2">{REQUESTS_COPY.notFoundDetail}</p>
      <RequestBackLink
        to={listPath}
        label={isInbox ? REQUESTS_COPY.inboxTitle : REQUESTS_COPY.requests}
      />
    </div>
  );
}
