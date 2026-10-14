import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { PendingInvitation } from "@/lib/auth/auth";
import { clearHistoryState } from "@/lib/history-state";
import { getCreatedClientId, INVITE_PARAM } from "@/lib/new-client";
import { INVITATION_COPY } from "@/lib/team-invitations";
import { toast } from "@/lib/toast";

const CLIENT_CREATED = "Client created";

type TeamInvitations = {
  isInviteOpen: boolean;
  handleInviteOpenChange: (open: boolean) => void;
  notice: string | null;
  handleNotice: (message: string | null) => void;
  highlightedId: string | null;
  handleSent: (invitationId: string) => void;
  handleRowGone: (invitationId: string) => void;
  getDrawerReturnFocus: () => HTMLElement | null;
  inviteButtonRef: React.RefObject<HTMLButtonElement | null>;
  pendingTitleRef: React.RefObject<HTMLHeadingElement | null>;
};

type InvitationsTeam = {
  // Null on the client /team page, which no create arrives at (its
  // INVITE_PARAM is ignored).
  clientId: string | null;
  // The Admin's "Invite first Owner" may show (and INVITE_PARAM opens it).
  canInviteFirstOwner: boolean;
  pendingInvitations: PendingInvitation[];
};

type TeamInvitationsOptions = {
  // After a revoke or a stale row, whether focus may go back up to the
  // invite action when it has just returned (the Admin's "Invite first
  // Owner"). Otherwise it always goes to the Pending invitations heading.
  canReturnToInvite: boolean;
};

// A Team page's invitation state: the invite drawer (auto-opened by
// INVITE_PARAM after a create), the pending panel's notice and highlight,
// and where focus lands after a send or a revoke.
export function useTeamInvitations(
  team: InvitationsTeam,
  { canReturnToInvite }: TeamInvitationsOptions,
): TeamInvitations {
  const location = useLocation();
  const navigate = useNavigate();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // The invitation whose row is on its way out (revoked, or stale).
  const [goneId, setGoneId] = useState<string | null>(null);
  const hasSentRef = useRef(false);
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const pendingTitleRef = useRef<HTMLHeadingElement>(null);
  const hasInviteFlag = new URLSearchParams(location.search).has(INVITE_PARAM);
  const { canInviteFirstOwner, pendingInvitations } = team;

  // Arriving from a create: open the drawer, then drop the flag so a reload
  // doesn't reopen it. The location state rides along, so the sidebar's
  // highlight isn't cut short; once the URL is replaced, the history entry
  // loses it, as the h1 focus effect does on arrival.
  useEffect(() => {
    if (!hasInviteFlag || team.clientId === null) return;

    // The drawer opening confirms the create. A toast would cover its
    // footer, and the open modal would make the toast inert.
    if (canInviteFirstOwner) {
      openInvite();
    } else if (getCreatedClientId(location.state) === team.clientId) {
      toast(CLIENT_CREATED);
    }
    const params = new URLSearchParams(location.search);
    params.delete(INVITE_PARAM);
    const search = params.toString();
    void Promise.resolve(
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : "" },
        { replace: true, preventScrollReset: true, state: location.state },
      ),
    ).then(clearHistoryState);
    // Only the flag's arrival matters, not the values read alongside it.
  }, [hasInviteFlag]);

  // After a revoke or a stale row: once the page has revalidated, focus the
  // returned "Invite first Owner" (when allowed), or the panel heading.
  useEffect(() => {
    if (goneId === null) return;

    const isRowGone = !pendingInvitations.some(({ id }) => id === goneId);
    if (canReturnToInvite && canInviteFirstOwner && inviteButtonRef.current) {
      inviteButtonRef.current.focus();
      setGoneId(null);
    } else if (isRowGone) {
      pendingTitleRef.current?.focus();
      setGoneId(null);
    }
  }, [goneId, canReturnToInvite, canInviteFirstOwner, pendingInvitations]);

  function openInvite(): void {
    hasSentRef.current = false;
    setNotice(null);
    setIsInviteOpen(true);
  }

  function handleInviteOpenChange(open: boolean): void {
    if (open) {
      openInvite();
    } else {
      setIsInviteOpen(false);
    }
  }

  // Stable: the form and row hooks list these in their effects' deps.
  const handleSent = useCallback((invitationId: string): void => {
    hasSentRef.current = true;
    setHighlightedId(invitationId);
    setIsInviteOpen(false);
    toast(INVITATION_COPY.sent);
  }, []);

  const handleRowGone = useCallback((invitationId: string): void => {
    setGoneId(invitationId);
  }, []);

  // After a send, focus goes to the panel heading, where the new row is (the
  // Admin's primary action unmounts then); otherwise back to the action (also after an auto-open, which
  // had no click to return to).
  function getDrawerReturnFocus(): HTMLElement | null {
    if (hasSentRef.current) return pendingTitleRef.current;

    // Gone when a stale page's revalidation found the slot taken.
    return inviteButtonRef.current ?? pendingTitleRef.current;
  }

  return {
    isInviteOpen,
    handleInviteOpenChange,
    notice,
    handleNotice: setNotice,
    highlightedId,
    handleSent,
    handleRowGone,
    getDrawerReturnFocus,
    inviteButtonRef,
    pendingTitleRef,
  };
}
