import { Link } from "react-router";
import { FACT_ROW_CLASS } from "@/components/admin/admin-requests-grid";
import ArchivedBadge from "@/components/admin/archived-badge";
import RequestKind from "@/components/requests/request-kind";
import RequestStatus from "@/components/requests/request-status";
import DateText from "@/components/ui/date-text";
import Panel from "@/components/ui/panel";
import { getClientRequestsPath, REQUESTS_COPY } from "@/lib/admin-requests";
import { getBoardPath } from "@/lib/board-detail";
import type { AdminRequestDetail } from "@/lib/requests/requests";
import { cn } from "@/lib/utils";

const LINK_CLASS =
  "text-accent-fg underline-offset-2 transition-[color,text-decoration-color] duration-(--dur-instant) hover:underline";
const MICRO_LABEL_CLASS =
  "mb-1.5 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase";

type RequestFactsPanelProps = {
  request: AdminRequestDetail;
  // The inbox route names the Client; the tab's header already does.
  isClientShown: boolean;
  // Just saved: the Status and Linked task rows get the highlight fade.
  isSavedHighlighted: boolean;
};

// The Request's read-only facts, then its description as plain text.
export default function RequestFactsPanel({
  request,
  isClientShown,
  isSavedHighlighted,
}: RequestFactsPanelProps): React.ReactNode {
  const savedRowClass = cn(
    FACT_ROW_CLASS,
    isSavedHighlighted && "animate-row-highlight",
  );

  return (
    <Panel
      title={REQUESTS_COPY.request}
      meta={
        <>
          Submitted <DateText date={request.createdAt} />
        </>
      }
    >
      <dl>
        {isClientShown && (
          <div className={FACT_ROW_CLASS}>
            <dt className="text-fg-2">Client</dt>
            <dd className="wrap-anywhere text-fg">
              <Link
                to={getClientRequestsPath(request.clientId)}
                className={LINK_CLASS}
              >
                {request.clientName}
              </Link>
              {request.clientArchived && (
                <>
                  {" "}
                  <ArchivedBadge />
                </>
              )}
            </dd>
          </div>
        )}
        <div className={FACT_ROW_CLASS}>
          <dt className="text-fg-2">Kind</dt>
          <dd>
            <RequestKind kind={request.kind} />
          </dd>
        </div>
        <div className={savedRowClass}>
          <dt className="text-fg-2">Status</dt>
          <dd className="wrap-anywhere">
            <RequestStatus status={request.status} />
            <span className="font-mono text-xs/4 text-fg-2">
              {" · updated "}
              <DateText date={request.statusChangedAt} />
            </span>
          </dd>
        </div>
        <div className={FACT_ROW_CLASS}>
          <dt className="text-fg-2">Project</dt>
          <dd className="wrap-anywhere">
            {request.project === null ? (
              <span className="text-fg-2">{REQUESTS_COPY.noProject}</span>
            ) : (
              <Link
                to={getBoardPath(request.clientId, request.project.id)}
                className={LINK_CLASS}
              >
                {request.project.name}
              </Link>
            )}
          </dd>
        </div>
        <div className={FACT_ROW_CLASS}>
          <dt className="text-fg-2">Submitter</dt>
          <dd className="wrap-anywhere">
            <span className="block text-fg">{request.submitterName}</span>
            <span className="block font-mono text-xs/4 wrap-anywhere text-fg-2">
              {request.submitterEmail}
            </span>
          </dd>
        </div>
        <div className={savedRowClass}>
          <dt className="text-fg-2">{REQUESTS_COPY.linkedTask}</dt>
          <dd className="wrap-anywhere">
            <LinkedTaskText request={request} />
          </dd>
        </div>
      </dl>
      <div className="border-t border-line px-3 py-3">
        <h3 className={MICRO_LABEL_CLASS}>{REQUESTS_COPY.description}</h3>
        {/* Plain text, never Markdown. */}
        <p className="text-sm/5 wrap-anywhere whitespace-pre-wrap text-fg">
          {request.description}
        </p>
      </div>
    </Panel>
  );
}

// Not a link: the Admin has no Task page.
function LinkedTaskText({
  request,
}: {
  request: AdminRequestDetail;
}): React.ReactNode {
  if (request.taskTitle === null) {
    return <span className="text-fg-2">{REQUESTS_COPY.none}</span>;
  }

  return (
    <>
      <span className="text-fg">{request.taskTitle}</span>
      {!request.taskTracked && (
        <span className="text-fg-2"> {REQUESTS_COPY.notTracked}</span>
      )}
    </>
  );
}

// The read-only Triage panel's note, as plain text.
export function ResponseNoteBlock({
  note,
}: {
  note: string | null;
}): React.ReactNode {
  return (
    <div className="border-t border-line px-3 py-3">
      <h3 className={MICRO_LABEL_CLASS}>{REQUESTS_COPY.responseNote}</h3>
      {note === null ? (
        <p className="text-sm/5 text-fg-2">{REQUESTS_COPY.noResponseNote}</p>
      ) : (
        <p className="text-sm/5 wrap-anywhere whitespace-pre-wrap text-fg">
          {note}
        </p>
      )}
    </div>
  );
}
