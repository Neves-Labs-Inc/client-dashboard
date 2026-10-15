import { useEffect, useId, useRef } from "react";
import ColumnMappingList, {
  ColumnMappingHelp,
} from "@/components/admin/column-mapping-list";
import ColumnMappingSkeleton from "@/components/admin/column-mapping-skeleton";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import FormError from "@/components/ui/form-error";
import InfoBanner from "@/components/ui/info-banner";
import Select from "@/components/ui/select";
import {
  useLinkBoardForm,
  type LinkBoardForm,
} from "@/hooks/use-link-board-form";
import type { UnassignedBoard } from "@/lib/board-sync/board-sync";
import { getRelinkNote, LINK_COPY } from "@/lib/link-board";

const DIRTY_CONFIRM = {
  message: "Discard this link?",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

type ClientOption = { id: string; name: string };

type LinkBoardDrawerProps = {
  // The board from `?link=`; null when closed.
  boardNodeId: string | null;
  // Active Clients by name; null when they couldn't load.
  clients: ClientOption[] | null;
  // Home's streamed pool, for the title when the draft can't give it.
  boards: Promise<UnassignedBoard[] | "github-off" | null>;
  onOpenChange: (open: boolean) => void;
};

export default function LinkBoardDrawer({
  boardNodeId,
  clients,
  boards,
  onOpenChange,
}: LinkBoardDrawerProps): React.ReactNode {
  const formId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const activeClients = clients ?? [];
  const form = useLinkBoardForm(boardNodeId, activeClients, boards);
  const isUnavailable = form.draftStatus === "unavailable";

  // The Client select had focus and is now disabled: Cancel is all that's
  // left to do.
  useEffect(() => {
    if (isUnavailable) cancelRef.current?.focus();
  }, [isUnavailable]);
  const hasClients = activeClients.length > 0;
  const canLink = form.draftStatus === "ready" && hasClients;

  return (
    <Drawer
      open={boardNodeId !== null}
      onOpenChange={onOpenChange}
      title={`Link ${form.boardTitle ?? "board"}`}
      error={isUnavailable ? LINK_COPY.unavailable : form.banner}
      isDirty={form.isDirty && !form.isLinked && !isUnavailable}
      dirtyConfirm={DIRTY_CONFIRM}
      shouldReturnFocus={!form.isLinked}
      getReturnFocusTarget={() => findBoardLink(form.boardNodeId)}
      footer={({ requestClose }) => (
        <>
          <Button ref={cancelRef} onClick={requestClose}>
            Cancel
          </Button>
          {!isUnavailable && (
            <Button
              variant="primary"
              type="submit"
              form={formId}
              disabled={!canLink}
              isPending={form.isPending}
              pendingLabel="Linking…"
            >
              Link board
            </Button>
          )}
        </>
      )}
    >
      {form.relinkClientName !== null && (
        <InfoBanner>{getRelinkNote(form.relinkClientName)}</InfoBanner>
      )}
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit}
        className="flex flex-col gap-4"
      >
        <Field
          label="Client"
          error={form.clientError ?? undefined}
          help={hasClients ? undefined : LINK_COPY.noClients}
        >
          {(control) => (
            <Select
              {...control}
              ref={form.clientSelectRef}
              name="clientId"
              required
              value={form.clientId}
              disabled={!hasClients || isUnavailable}
              onChange={form.handleClientChange}
            >
              <option value="">Choose a Client</option>
              {activeClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {!isUnavailable && <ColumnsFieldset form={form} />}
      </form>
    </Drawer>
  );
}

function ColumnsFieldset({ form }: { form: LinkBoardForm }): React.ReactNode {
  let body: React.ReactNode;
  if (form.draftStatus === "failed") {
    body = (
      <div>
        <FormError variant="banner" isAnimated={false}>
          {LINK_COPY.githubFailed}
        </FormError>
        <Button
          className="mt-2"
          isPending={form.isRetrying}
          pendingLabel="Trying again…"
          onClick={form.handleRetry}
        >
          Try again
        </Button>
      </div>
    );
  } else if (form.draft === null) {
    body = (
      <>
        <ColumnMappingHelp />
        <ColumnMappingSkeleton />
      </>
    );
  } else {
    body = (
      <ColumnMappingList
        options={form.draft.options}
        mapping={form.mapping}
        onChange={form.handleMappingChange}
      />
    );
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-[13px]/[18px] font-semibold text-fg">
        Columns
      </legend>
      <div ref={form.columnsRef}>{body}</div>
    </fieldset>
  );
}

// The row's Link, found at close time: a Home revalidation may have
// re-rendered it.
function findBoardLink(boardNodeId: string | null): HTMLElement | null {
  if (boardNodeId === null) return null;

  return document.querySelector<HTMLElement>(
    `[data-board-link="${CSS.escape(boardNodeId)}"]`,
  );
}
