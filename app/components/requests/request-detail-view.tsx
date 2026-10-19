import { ArrowLeft, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import ProfileReadOnlyRow from "@/components/client/profile-read-only-row";
import LinkedTaskPanel from "@/components/requests/linked-task-panel";
import RequestDrawer from "@/components/requests/request-drawer";
import RequestKind from "@/components/requests/request-kind";
import RequestStatus from "@/components/requests/request-status";
import RequestWithdrawConfirm from "@/components/requests/request-withdraw-confirm";
import Button from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import DateText from "@/components/ui/date-text";
import FormError from "@/components/ui/form-error";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { RequestFormValues } from "@/hooks/use-request-form";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import { useWithdrawRequest } from "@/hooks/use-withdraw-request";
import {
  EDIT_REQUEST_PARAM,
  EDIT_REQUEST_SEARCH,
  EDIT_REQUEST_VALUE,
  getRequestPath,
} from "@/lib/request-drawer";
import { REQUEST_COPY } from "@/lib/request-outcome";
import type { ProjectOption, RequestDetail } from "@/lib/requests/requests";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const LINK_BUTTON_CLASS =
  "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4";
const TEXT_BODY_CLASS =
  "px-3 py-3 text-sm/5 whitespace-pre-wrap break-words text-fg";

// What just changed, for the one-off highlight fade.
const EDITED = "edited";
const WITHDRAWN = "withdrawn";

type RequestDetailViewProps = {
  clientName: string;
  detail: RequestDetail;
  // For the edit drawer; empty when the viewer can't edit.
  projectOptions: ProjectOption[];
};

function toFormValues(detail: RequestDetail): RequestFormValues {
  return {
    kind: detail.kind,
    title: detail.title,
    description: detail.description,
    projectId: detail.project?.id ?? "",
  };
}

// One Request for its Client: its facts, description, the Admin's response
// and linked Task. Its submitter may edit or withdraw it while it is New.
export default function RequestDetailView({
  clientName,
  detail,
  projectOptions,
}: RequestDetailViewProps): React.ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const editLinkRef = useRef<HTMLAnchorElement>(null);
  // Set by a not-new refusal: the banner stays once the controls are gone.
  const [isNoLongerNew, setIsNoLongerNew] = useState(false);
  const { highlightedId, highlight } = useRowHighlight(null);
  const paths = useClientPaths();
  const path = getRequestPath(detail.id);
  const isEditParam =
    searchParams.get(EDIT_REQUEST_PARAM) === EDIT_REQUEST_VALUE;
  // A refused drawer stays open on its banner after the controls go.
  const isEditing = isEditParam && (detail.canChange || isNoLongerNew);
  const hadControlsRef = useRef(detail.canChange);

  const closeDrawer = useCallback((): void => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(EDIT_REQUEST_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  const handleSaved = useCallback((): void => {
    closeDrawer();
    toast(REQUEST_COPY.updated);
    highlight(EDITED);
  }, [closeDrawer, highlight]);

  const handleWithdrawn = useCallback((): void => {
    toast(REQUEST_COPY.withdrawn);
    highlight(WITHDRAWN);
  }, [highlight]);

  const handleNoLongerNew = useCallback((): void => setIsNoLongerNew(true), []);

  const withdraw = useWithdrawRequest({
    action: path,
    onWithdrawn: handleWithdrawn,
    onNoLongerNew: handleNoLongerNew,
  });

  // When the controls go (withdrawn, or no longer New), focus would drop to
  // <body>: the h1 takes it. An open drawer returns focus itself on close.
  useEffect(() => {
    const hasLostControls = hadControlsRef.current && !detail.canChange;
    hadControlsRef.current = detail.canChange;
    if (hasLostControls && !isEditParam) titleRef.current?.focus();
  }, [detail.canChange, isEditParam]);

  function handleOpenChange(open: boolean): void {
    if (!open) closeDrawer();
  }

  const isEdited = highlightedId === EDITED;
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link
        to={paths.requests}
        className={cn(
          buttonStyles({ variant: "secondary" }),
          LINK_BUTTON_CLASS,
        )}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Requests
      </Link>
      {detail.canChange && (
        <>
          <Link
            ref={editLinkRef}
            to={EDIT_REQUEST_SEARCH}
            preventScrollReset
            className={cn(
              buttonStyles({ variant: "secondary" }),
              LINK_BUTTON_CLASS,
            )}
          >
            <Pencil size={14} aria-hidden="true" />
            Edit request
          </Link>
          <Button
            ref={withdraw.triggerRef}
            variant="destructive"
            aria-expanded={withdraw.isConfirming}
            aria-controls={
              withdraw.isConfirming ? withdraw.confirmId : undefined
            }
            onClick={withdraw.handleStart}
          >
            Withdraw request
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          { label: clientName, isTruncated: true },
          { label: "Requests", href: paths.requests },
        ]}
        title={detail.title}
        titleRef={titleRef}
        action={actions}
      />
      {detail.canChange && withdraw.isConfirming && (
        <RequestWithdrawConfirm withdraw={withdraw} />
      )}
      {isNoLongerNew && !detail.canChange && (
        <FormError variant="banner">{REQUEST_COPY.notNew}</FormError>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        {/* DOM order is the stacked order; from xl, Description and Response
            take the left column and Details and Linked task the right. */}
        <Panel title="Details" className="xl:col-start-2 xl:row-start-1">
          <dl
            className={cn(
              "divide-y divide-line",
              isEdited && "animate-row-highlight",
            )}
          >
            <ProfileReadOnlyRow label="Kind">
              <RequestKind kind={detail.kind} />
            </ProfileReadOnlyRow>
            <ProfileReadOnlyRow
              label="Status"
              className={cn(
                highlightedId === WITHDRAWN && "animate-row-highlight",
              )}
            >
              <span className="inline-flex flex-wrap items-baseline gap-x-1">
                <RequestStatus status={detail.status} className="self-center" />
                <span className="font-mono text-xs/4 text-fg-2">
                  · updated <DateText date={detail.statusChangedAt} />
                </span>
              </span>
            </ProfileReadOnlyRow>
            <ProfileReadOnlyRow label="Project">
              {detail.project === null ? (
                <span className="text-fg-2">No specific project</span>
              ) : (
                <Link
                  to={paths.getProjectPath(detail.project.id)}
                  className="text-accent-fg hover:underline"
                >
                  {detail.project.name}
                </Link>
              )}
            </ProfileReadOnlyRow>
            <ProfileReadOnlyRow label="Submitter">
              {detail.submitterName}
            </ProfileReadOnlyRow>
            <ProfileReadOnlyRow label="Submitted">
              <DateText date={detail.createdAt} />
            </ProfileReadOnlyRow>
          </dl>
        </Panel>
        {/* One left-column stack, so Response sits right under Description
            whatever the right column's height. */}
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Panel title="Description">
            {/* Plain text, never Markdown or HTML. */}
            <p
              className={cn(
                TEXT_BODY_CLASS,
                "max-w-prose",
                isEdited && "animate-row-highlight",
              )}
            >
              {detail.description}
            </p>
          </Panel>
          {detail.responseNote !== null && (
            <Panel title="Response">
              <p className={cn(TEXT_BODY_CLASS, "max-w-prose")}>
                {detail.responseNote}
              </p>
            </Panel>
          )}
        </div>
        {detail.task !== null && (
          <div className="min-w-0 xl:col-start-2 xl:row-start-2">
            <LinkedTaskPanel task={detail.task} />
          </div>
        )}
      </div>
      <RequestDrawer
        open={isEditing}
        onOpenChange={handleOpenChange}
        mode="edit"
        initial={toFormValues(detail)}
        projectOptions={projectOptions}
        clientName={clientName}
        action={path}
        onSaved={handleSaved}
        onNoLongerNew={handleNoLongerNew}
        getReturnFocusTarget={() => editLinkRef.current ?? titleRef.current}
      />
    </div>
  );
}
