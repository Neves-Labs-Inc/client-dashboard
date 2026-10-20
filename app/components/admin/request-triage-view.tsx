import { Archive, Lock } from "lucide-react";
import { useCallback, useRef } from "react";
import ClientWorkspaceHeader, {
  CLIENTS_CRUMB,
  type ClientWorkspace,
} from "@/components/admin/client-workspace-header";
import RequestBackLink from "@/components/admin/request-back-link";
import RequestFactsPanel, {
  ResponseNoteBlock,
} from "@/components/admin/request-facts-panel";
import RequestTriageForm from "@/components/admin/request-triage-form";
import EmptyState from "@/components/ui/empty-state";
import FormError from "@/components/ui/form-error";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { useArrivalFocus } from "@/hooks/use-arrival-focus";
import { useRequestTriageForm } from "@/hooks/use-request-triage-form";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import {
  getClientRequestPath,
  getClientRequestsPath,
  getInboxRequestPath,
  INBOX_PATH,
  REQUESTS_COPY,
} from "@/lib/admin-requests";
import { getTeamPath } from "@/lib/new-client";
import type { TaskOptionGroup } from "@/lib/requests/request-rules";
import type { AdminRequestDetail } from "@/lib/requests/requests";

// The highlight's one id: the Status and Linked task rows fade together.
const SAVED_HIGHLIGHT_ID = "saved";

type TriageData = {
  // Null when it couldn't load.
  request: AdminRequestDetail | null;
  taskOptions: TaskOptionGroup[] | null;
};

type RequestTriageViewProps =
  | ({ route: "inbox" } & TriageData)
  | ({
      route: "client";
      clientId: string;
      // Null when it couldn't load.
      client: ClientWorkspace | null;
    } & TriageData);

// One triage detail, two routes: from the inbox (the Request title is the
// h1) or in place of a Client's Requests tab (the workspace header keeps
// the h1; the title is an h2 under it).
export default function RequestTriageView(
  props: RequestTriageViewProps,
): React.ReactNode {
  if (props.route === "inbox") {
    return (
      <InboxTriage request={props.request} taskOptions={props.taskOptions} />
    );
  }
  if (props.client === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[CLIENTS_CRUMB]}
          title={REQUESTS_COPY.requests}
        />
        <TriageLoadFailed backTo={getClientRequestsPath(props.clientId)} />
      </>
    );
  }

  return (
    <ClientTriage
      client={props.client}
      request={props.request}
      taskOptions={props.taskOptions}
    />
  );
}

function InboxTriage({ request, taskOptions }: TriageData): React.ReactNode {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(titleRef);

  if (request === null) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: REQUESTS_COPY.requests }]}
          title={REQUESTS_COPY.inboxTitle}
        />
        <TriageLoadFailed backTo={INBOX_PATH} />
      </>
    );
  }

  return (
    <>
      <RequestBackLink
        to={INBOX_PATH}
        label={REQUESTS_COPY.inboxTitle}
        fromRequestId={request.id}
      />
      <PageHeader
        breadcrumb={[
          { label: REQUESTS_COPY.requests, href: INBOX_PATH },
          { label: request.clientName, isTruncated: true },
        ]}
        title={request.title}
        titleRef={titleRef}
      />
      <TriageBody
        request={request}
        taskOptions={taskOptions}
        action={getInboxRequestPath(request.id)}
        isClientShown
      />
    </>
  );
}

function ClientTriage({
  client,
  request,
  taskOptions,
}: TriageData & { client: ClientWorkspace }): React.ReactNode {
  const headerTitleRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tabPath = getClientRequestsPath(client.clientId);
  // Archive and unarchive post to the Team route, which owns them.
  const archive = useArchiveClient({
    clientName: client.name,
    action: getTeamPath(client.clientId),
    titleRef: headerTitleRef,
  });
  useArrivalFocus(titleRef);

  return (
    <>
      <ClientWorkspaceHeader
        client={client}
        tab="requests"
        archive={archive}
        titleRef={headerTitleRef}
      />
      {request === null ? (
        <TriageLoadFailed backTo={tabPath} />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <RequestBackLink
              to={tabPath}
              label={REQUESTS_COPY.requests}
              fromRequestId={request.id}
            />
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="text-sm/5 font-semibold wrap-anywhere text-fg outline-hidden"
            >
              {request.title}
            </h2>
          </div>
          <TriageBody
            request={request}
            taskOptions={taskOptions}
            action={getClientRequestPath(client.clientId, request.id)}
            isClientShown={false}
          />
        </>
      )}
    </>
  );
}

function TriageBody({
  request,
  taskOptions,
  action,
  isClientShown,
}: {
  request: AdminRequestDetail;
  taskOptions: TaskOptionGroup[] | null;
  action: string;
  isClientShown: boolean;
}): React.ReactNode {
  const { highlightedId, highlight } = useRowHighlight(null);
  const handleSaved = useCallback(
    () => highlight(SAVED_HIGHLIGHT_ID),
    [highlight],
  );
  const form = useRequestTriageForm({
    request,
    action,
    onSaved: handleSaved,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
      <RequestFactsPanel
        request={request}
        isClientShown={isClientShown}
        isSavedHighlighted={highlightedId === SAVED_HIGHLIGHT_ID}
      />
      <Panel title={REQUESTS_COPY.triage}>
        {/* Above the form, and kept when a read-only refusal removes it. */}
        {form.banner !== null && (
          <div className="px-3 pt-3">
            <div ref={form.bannerRef} tabIndex={-1} className="outline-hidden">
              <FormError variant="banner">{form.banner}</FormError>
            </div>
          </div>
        )}
        <TriagePanelBody
          request={request}
          taskOptions={taskOptions}
          form={form}
        />
      </Panel>
    </div>
  );
}

function TriagePanelBody({
  request,
  taskOptions,
  form,
}: {
  request: AdminRequestDetail;
  taskOptions: TaskOptionGroup[] | null;
  form: ReturnType<typeof useRequestTriageForm>;
}): React.ReactNode {
  if (request.status === "WITHDRAWN") {
    return (
      <>
        <EmptyState icon={<Lock size={16} aria-hidden="true" />}>
          {REQUESTS_COPY.withdrawnLine}
        </EmptyState>
        <ResponseNoteBlock note={request.responseNote} />
      </>
    );
  }
  if (request.clientArchived) {
    return (
      <>
        <EmptyState icon={<Archive size={16} aria-hidden="true" />}>
          {REQUESTS_COPY.archived}
        </EmptyState>
        <ResponseNoteBlock note={request.responseNote} />
      </>
    );
  }

  const currentTask =
    request.taskId === null || request.taskTitle === null
      ? null
      : { id: request.taskId, title: request.taskTitle };
  return (
    <div className="p-3">
      <RequestTriageForm
        form={form}
        taskOptions={taskOptions}
        currentTask={currentTask}
      />
    </div>
  );
}

function TriageLoadFailed({ backTo }: { backTo: string }): React.ReactNode {
  return (
    <>
      <RequestBackLink
        to={backTo}
        label={
          backTo === INBOX_PATH
            ? REQUESTS_COPY.inboxTitle
            : REQUESTS_COPY.requests
        }
      />
      <div className="rounded-[3px] border border-line bg-surface">
        <PanelError message={REQUESTS_COPY.detailLoadFailed} />
      </div>
    </>
  );
}
