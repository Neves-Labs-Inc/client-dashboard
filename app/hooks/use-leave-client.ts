import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigation, useRevalidator } from "react-router";
import {
  getLeaveFailedNotice,
  LEFT_PATH,
  PROFILE_COPY,
  PROFILE_INTENT_FIELD,
  PROFILE_PATH,
  type ProfileOutcome,
} from "@/lib/profile";

type LeaveClient = {
  isConfirming: boolean;
  isLeaving: boolean;
  notice: string | null;
  leaveRef: React.RefObject<HTMLButtonElement | null>;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  handleStart: () => void;
  handleKeep: () => void;
  handleLeave: () => void;
  handleConfirmKeyDown: (event: React.KeyboardEvent) => void;
};

const SIGN_IN_PATH = LEFT_PATH.split("?")[0];

// The Leave panel's confirm and request. A success redirects to sign-in
// (every session is gone), so "Leaving…" holds through that navigation. A
// refusal or failure closes the confirm into the panel's notice.
export function useLeaveClient(clientName: string): LeaveClient {
  const fetcher = useFetcher<ProfileOutcome>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [isConfirming, setIsConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusLeaveRef = useRef(false);
  const handledRef = useRef<ProfileOutcome | undefined>(fetcher.data);
  const isLeaving =
    fetcher.state !== "idle" ||
    (navigation.state === "loading" &&
      navigation.location.pathname === SIGN_IN_PATH);

  // Keep, Esc or a failed leave hands focus back to "Leave <Client>" once
  // it is rendered again.
  useEffect(() => {
    if (isConfirming || !shouldFocusLeaveRef.current) return;

    shouldFocusLeaveRef.current = false;
    leaveRef.current?.focus();
  }, [isConfirming]);

  // Each outcome is handled once.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state === "submitting" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    setIsConfirming(false);
    const error = outcome.kind === "refused" ? outcome.error : null;
    if (error === "last-owner") {
      // A stale page: the fresh one disables the button and says why.
      setNotice(PROFILE_COPY.lastOwnerHelp);
      titleRef.current?.focus();
      void revalidator.revalidate();
    } else {
      setNotice(getLeaveFailedNotice(clientName));
      shouldFocusLeaveRef.current = true;
      // No longer a member, or the Client was archived: the guard sends
      // the fresh page elsewhere.
      if (error === "not-found" || error === "archived") {
        void revalidator.revalidate();
      }
    }
  }, [fetcher.data, fetcher.state, clientName, revalidator]);

  function handleKeep(): void {
    shouldFocusLeaveRef.current = true;
    setIsConfirming(false);
  }

  function handleLeave(): void {
    if (isLeaving) return;

    setNotice(null);
    void fetcher.submit(
      { [PROFILE_INTENT_FIELD]: "leave" },
      { method: "post", action: PROFILE_PATH },
    );
  }

  function handleConfirmKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape" || isLeaving) return;

    event.preventDefault();
    handleKeep();
  }

  return {
    isConfirming,
    isLeaving,
    notice,
    leaveRef,
    titleRef,
    handleStart: () => {
      setNotice(null);
      setIsConfirming(true);
    },
    handleKeep,
    handleLeave,
    handleConfirmKeyDown,
  };
}
