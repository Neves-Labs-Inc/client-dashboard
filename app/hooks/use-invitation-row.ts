import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
  INVITATION_ID_FIELD,
  INVITATION_INTENT_FIELD,
  type InvitationIntent,
  type InvitationOutcome,
  type InvitationRowCopy,
} from "@/lib/team-invitations";
import { toast } from "@/lib/toast";

type InvitationRowOptions = {
  invitationId: string;
  // The route the resend and revoke post to.
  action: string;
  copy: InvitationRowCopy;
  isConfirming: boolean;
  onConfirmingChange: (isConfirming: boolean) => void;
  // A message for the panel's notice; null clears it.
  onNotice: (message: string | null) => void;
  // Revoked, or found no longer pending: the row is about to unmount.
  onRowGone: (invitationId: string) => void;
};

type InvitationRowActions = {
  isResending: boolean;
  isRevoking: boolean;
  revokeRef: React.RefObject<HTMLButtonElement | null>;
  handleResend: () => void;
  handleStartRevoke: () => void;
  handleKeep: () => void;
  handleRevoke: () => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

// One pending row's resend and revoke. Its own fetcher, so two rows never
// share pending state. Failures go up to the panel's notice: a row that
// isn't pending any more is about to unmount.
export function useInvitationRow({
  invitationId,
  action,
  copy,
  isConfirming,
  onConfirmingChange,
  onNotice,
  onRowGone,
}: InvitationRowOptions): InvitationRowActions {
  const fetcher = useFetcher<InvitationOutcome>();
  const revalidator = useRevalidator();
  const intentRef = useRef<InvitationIntent | null>(null);
  const handledRef = useRef<InvitationOutcome | undefined>(fetcher.data);
  const revokeRef = useRef<HTMLButtonElement>(null);
  const shouldFocusRevokeRef = useRef(false);
  const isBusy = fetcher.state !== "idle";
  const pendingIntent = fetcher.formData?.get(INVITATION_INTENT_FIELD);

  // Keep or Esc hands focus back to "Revoke" once it's rendered again.
  useEffect(() => {
    if (isConfirming || !shouldFocusRevokeRef.current) return;

    shouldFocusRevokeRef.current = false;
    revokeRef.current?.focus();
  }, [isConfirming]);

  // Each outcome is handled once. A success arrives while the page
  // revalidates (the fetcher is "loading"), before a revoked row unmounts.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state === "submitting" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    const isRevoke = intentRef.current === "revoke";
    const rateLimit =
      outcome.kind === "refused" ? copy.rateLimits[outcome.error] : undefined;
    if (outcome.kind === "resent") {
      toast(copy.resent);
    } else if (outcome.kind === "revoked") {
      toast(copy.revoked);
      onRowGone(invitationId);
    } else if (rateLimit) {
      // The row stays, and so does focus on its button.
      onNotice(rateLimit);
    } else if (outcome.kind === "refused") {
      onNotice(outcome.error === "archived" ? copy.archived : copy.notPending);
      onConfirmingChange(false);
      // Drops the row that's no longer pending; focus moves on once it's
      // gone, as after a revoke.
      onRowGone(invitationId);
      void revalidator.revalidate();
    } else {
      onNotice(isRevoke ? copy.revokeFailed : copy.resendFailed);
      if (isRevoke) {
        shouldFocusRevokeRef.current = true;
        onConfirmingChange(false);
      }
    }
  }, [
    fetcher.data,
    fetcher.state,
    copy,
    invitationId,
    onConfirmingChange,
    onNotice,
    onRowGone,
    revalidator,
  ]);

  function submit(intent: InvitationIntent): void {
    if (isBusy) return;

    intentRef.current = intent;
    onNotice(null);
    void fetcher.submit(
      {
        [INVITATION_INTENT_FIELD]: intent,
        [INVITATION_ID_FIELD]: invitationId,
      },
      { method: "post", action },
    );
  }

  function handleKeep(): void {
    shouldFocusRevokeRef.current = true;
    onConfirmingChange(false);
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape" || isBusy) return;

    event.preventDefault();
    handleKeep();
  }

  return {
    isResending: isBusy && pendingIntent === "resend",
    isRevoking: isBusy && pendingIntent === "revoke",
    revokeRef,
    handleResend: () => submit("resend"),
    handleStartRevoke: () => onConfirmingChange(true),
    handleKeep,
    handleRevoke: () => submit("revoke"),
    handleConfirmKeyDown,
  };
}
