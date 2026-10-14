import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  ARCHIVE_COPY,
  getArchiveFailure,
  type ArchiveIntent,
  type ArchiveOutcome,
} from "@/lib/team-archive";
import { INVITATION_INTENT_FIELD } from "@/lib/team-invitations";
import { toast } from "@/lib/toast";

type ArchiveClientOptions = {
  clientName: string;
  // The Team route the archive and unarchive post to.
  action: string;
  // The h1, focused once an archive or unarchive succeeds.
  titleRef: React.RefObject<HTMLHeadingElement | null>;
};

export type ArchiveClient = {
  isConfirming: boolean;
  // The confirm block's id, for the trigger's aria-controls.
  confirmId: string;
  // From the submit until the page has revalidated.
  isBusy: boolean;
  isArchiving: boolean;
  isUnarchiving: boolean;
  // The failed intent's alert line, or null.
  error: string | null;
  failedIntent: ArchiveIntent | null;
  // Set by a successful archive, so the badge fades in only then.
  isJustArchived: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  handleStartArchive: () => void;
  handleKeep: () => void;
  handleArchive: () => void;
  handleUnarchive: () => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

// The Admin's archive (behind an inline confirm) and unarchive of a Client,
// on one fetcher. An outcome is handled once the fetcher is idle again, so
// the page has revalidated into the new state before focus moves.
export function useArchiveClient({
  clientName,
  action,
  titleRef,
}: ArchiveClientOptions): ArchiveClient {
  const fetcher = useFetcher<ArchiveOutcome>();
  const confirmId = useId();
  const [isConfirming, setIsConfirming] = useState(false);
  const [failedIntent, setFailedIntent] = useState<ArchiveIntent | null>(null);
  const [isJustArchived, setIsJustArchived] = useState(false);
  const handledRef = useRef<ArchiveOutcome | undefined>(fetcher.data);
  const intentRef = useRef<ArchiveIntent>("archive");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shouldFocusTriggerRef = useRef(false);
  const isBusy = fetcher.state !== "idle";
  const pendingIntent = fetcher.formData?.get(INVITATION_INTENT_FIELD);

  // Keep or Esc hands focus back to "Archive client" once it's rendered
  // again.
  useEffect(() => {
    if (isConfirming || !shouldFocusTriggerRef.current) return;

    shouldFocusTriggerRef.current = false;
    triggerRef.current?.focus();
  }, [isConfirming]);

  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "archived" || outcome.kind === "unarchived") {
      const isArchived = outcome.kind === "archived";
      setIsConfirming(false);
      setFailedIntent(null);
      setIsJustArchived(isArchived);
      toast(isArchived ? ARCHIVE_COPY.archived : ARCHIVE_COPY.unarchived);
      titleRef.current?.focus();
    } else {
      // The confirm (or the Unarchive button) stays, and so does focus.
      setFailedIntent(intentRef.current);
    }
  }, [fetcher.data, fetcher.state, titleRef]);

  function submit(intent: ArchiveIntent): void {
    if (isBusy) return;

    intentRef.current = intent;
    setFailedIntent(null);
    void fetcher.submit(
      { [INVITATION_INTENT_FIELD]: intent },
      { method: "post", action },
    );
  }

  function handleKeep(): void {
    if (isBusy) return;

    shouldFocusTriggerRef.current = true;
    setFailedIntent(null);
    setIsConfirming(false);
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape" || isBusy) return;

    event.preventDefault();
    handleKeep();
  }

  return {
    isConfirming,
    confirmId,
    isBusy,
    isArchiving: isBusy && pendingIntent === "archive",
    isUnarchiving: isBusy && pendingIntent === "unarchive",
    error: failedIntent && getArchiveFailure(failedIntent, clientName),
    failedIntent,
    isJustArchived,
    triggerRef,
    handleStartArchive: () => setIsConfirming(true),
    handleKeep,
    handleArchive: () => submit("archive"),
    handleUnarchive: () => submit("unarchive"),
    handleConfirmKeyDown,
  };
}
