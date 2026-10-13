import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { TeamMember } from "@/lib/auth/auth";
import { INVITATION_INTENT_FIELD } from "@/lib/team-invitations";
import {
  getLastOwnerNotice,
  getRemovedToast,
  MEMBER_ID_FIELD,
  ROSTER_COPY,
  type RosterIntent,
  type TeamOutcome,
} from "@/lib/team-roster";
import { toast } from "@/lib/toast";

type MemberRowOptions = {
  member: TeamMember;
  clientName: string;
  // The route the role changes and the remove post to.
  action: string;
  isConfirming: boolean;
  onConfirmingChange: (isConfirming: boolean) => void;
  // A message for the panel's notice; null clears it.
  onNotice: (message: string | null) => void;
  onRoleChanged: (userId: string) => void;
  // Removed, or found no longer on the team: the row is about to unmount.
  onRowGone: (userId: string) => void;
};

type MemberRowActions = {
  isSaving: boolean;
  isRemoving: boolean;
  removeRef: React.RefObject<HTMLButtonElement | null>;
  handleRoleChange: () => void;
  handleStartRemove: () => void;
  handleKeep: () => void;
  handleRemove: () => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

// One Users row's role change and remove. Its own fetcher, so two rows
// never share pending state. Not optimistic: the role cell keeps its value
// until the page revalidates. Failures go up to the panel's notice.
export function useMemberRow({
  member,
  clientName,
  action,
  isConfirming,
  onConfirmingChange,
  onNotice,
  onRoleChanged,
  onRowGone,
}: MemberRowOptions): MemberRowActions {
  const fetcher = useFetcher<TeamOutcome>();
  const revalidator = useRevalidator();
  const intentRef = useRef<RosterIntent | null>(null);
  const handledRef = useRef<TeamOutcome | undefined>(fetcher.data);
  const removeRef = useRef<HTMLButtonElement>(null);
  const shouldFocusRemoveRef = useRef(false);
  const isBusy = fetcher.state !== "idle";
  const pendingIntent = fetcher.formData?.get(INVITATION_INTENT_FIELD);
  const { userId } = member;

  // Keep, Esc or a failed remove hands focus back to "Remove" once it's
  // rendered again.
  useEffect(() => {
    if (isConfirming || !shouldFocusRemoveRef.current) return;

    shouldFocusRemoveRef.current = false;
    removeRef.current?.focus();
  }, [isConfirming]);

  // Each outcome is handled once. A success arrives while the page
  // revalidates (the fetcher is "loading"), before the row changes.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state === "submitting" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    const isRemove = intentRef.current === "remove";
    const error = outcome.kind === "refused" ? outcome.error : null;
    if (outcome.kind === "role-changed") {
      toast(ROSTER_COPY.roleUpdated);
      onRoleChanged(userId);
    } else if (outcome.kind === "removed") {
      toast(getRemovedToast(member));
      onRowGone(userId);
    } else if (error === "not-found") {
      onNotice(ROSTER_COPY.notOnTeam);
      onConfirmingChange(false);
      // Focus moves on once the row has dropped, as after a remove.
      onRowGone(userId);
      void revalidator.revalidate();
    } else {
      onNotice(
        error === "last-owner"
          ? getLastOwnerNotice(clientName)
          : ROSTER_COPY.failed,
      );
      if (isRemove) {
        shouldFocusRemoveRef.current = true;
        onConfirmingChange(false);
      }
      // The viewer lost Owner rights, or the Client was archived: the
      // controls go away with the fresh page.
      if (error === "forbidden" || error === "archived") {
        void revalidator.revalidate();
      }
    }
  }, [
    fetcher.data,
    fetcher.state,
    member,
    clientName,
    userId,
    onConfirmingChange,
    onNotice,
    onRoleChanged,
    onRowGone,
    revalidator,
  ]);

  function submit(intent: RosterIntent): void {
    if (isBusy) return;

    intentRef.current = intent;
    onNotice(null);
    void fetcher.submit(
      { [INVITATION_INTENT_FIELD]: intent, [MEMBER_ID_FIELD]: userId },
      { method: "post", action },
    );
  }

  function handleKeep(): void {
    shouldFocusRemoveRef.current = true;
    onConfirmingChange(false);
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape" || isBusy) return;

    event.preventDefault();
    handleKeep();
  }

  return {
    isSaving:
      isBusy &&
      (pendingIntent === "make-owner" || pendingIntent === "make-member"),
    isRemoving: isBusy && pendingIntent === "remove",
    removeRef,
    handleRoleChange: () =>
      submit(member.role === "owner" ? "make-member" : "make-owner"),
    handleStartRemove: () => onConfirmingChange(true),
    handleKeep,
    handleRemove: () => submit("remove"),
    handleConfirmKeyDown,
  };
}
