import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { getAccessHome } from "@/lib/auth/access";
import {
  isPasskeyAutofillAvailable,
  signInWithPasskey,
  type PasskeySignInOutcome,
} from "@/lib/auth/auth-client";

export const ADMIN_PATH = getAccessHome("admin");
// Shorter than any human could pick a passkey and answer the prompt.
const MIN_INTERACTIVE_RUN_MS = 1000;

type Failure = "failed" | "rate-limited";

const FAILURE_COPY: Record<Failure, string> = {
  failed: "Couldn't sign in with a passkey. Try again.",
  "rate-limited": "Too many attempts. Try again in a minute.",
};

// The banner copy for a passkey sign-in that didn't sign in.
export function getPasskeySignInError(outcome: PasskeySignInOutcome): string {
  return FAILURE_COPY[toFailure(outcome)];
}

function toFailure(outcome: PasskeySignInOutcome): Failure {
  return outcome === "rate-limited" ? outcome : "failed";
}

type PasskeySignInOptions = {
  // True while the magic-link form is sending: autofill stops, and starts
  // again if the page stays.
  isAutofillPaused: boolean;
  // Called when a passkey attempt takes the page's one banner slot (the
  // button starts, or a chosen autofill passkey fails), so the page can
  // clear its other banner.
  onAttempt: () => void;
};

type PasskeySignIn = {
  banner: string | null;
  isPending: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  handleClick: () => Promise<void>;
  clearBanner: () => void;
};

// /sign-in: the "Sign in with a passkey" button, and passkey autofill on the
// Email field whenever the page is idle.
export function usePasskeySignIn({
  isAutofillPaused,
  onAttempt,
}: PasskeySignInOptions): PasskeySignIn {
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Bumped to start autofill again once a run settles without signing in.
  const [autofillRun, setAutofillRun] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Read from the effect without restarting autofill when it changes.
  const showAutofillFailure = useEffectEvent((next: Failure) => {
    onAttempt();
    setFailure(next);
  });

  // The browser has no way to drop a pending autofill request except by
  // starting another ceremony (which the button does), so aborting here
  // means its failures are ignored: an abort never shows anything.
  useEffect(() => {
    if (isAutofillPaused || isPending) return;

    const controller = new AbortController();
    void runAutofill(controller.signal);
    return () => controller.abort();

    async function runAutofill(signal: AbortSignal): Promise<void> {
      if (!(await isPasskeyAutofillAvailable()) || signal.aborted) return;

      const startedAt = Date.now();
      const outcome = await signInWithPasskey({ autoFill: true });
      // Checked before the abort: the browser may still finish a passkey
      // picked after the run was dropped (e.g. while the magic-link form
      // sends), and the session it made must not be stranded on /sign-in.
      if (outcome === "signed-in") {
        setIsPending(true);
        await navigate(ADMIN_PATH);
        return;
      }
      if (signal.aborted || outcome === "aborted") return;

      // Autofill speaks only once a chosen passkey reached the server: a
      // browser that can't or won't run it isn't the user's failure.
      if (outcome !== "cancelled") showAutofillFailure(toFailure(outcome));
      // Keep the Email field offering passkeys after a dismissed prompt or
      // a failure. A run that ended at once (no authenticator, options
      // request refused) would only fail again, so it isn't retried.
      const wasInteractive = Date.now() - startedAt >= MIN_INTERACTIVE_RUN_MS;
      if (wasInteractive) setAutofillRun((run) => run + 1);
    }
  }, [isAutofillPaused, isPending, navigate, autofillRun]);

  async function handleClick(): Promise<void> {
    if (isPending) return;

    onAttempt();
    setFailure(null);
    setIsPending(true);
    const outcome = await signInWithPasskey();
    if (outcome === "signed-in") {
      // Stays pending until /admin renders, so the idle label never flashes.
      await navigate(ADMIN_PATH);
    } else {
      // Re-enable synchronously so focus can return to the button, which
      // the browser prompt took; the alert banner announces the failure.
      flushSync(() => {
        setIsPending(false);
        setFailure(toFailure(outcome));
      });
      buttonRef.current?.focus();
    }
  }

  return {
    banner: failure === null ? null : FAILURE_COPY[failure],
    isPending,
    buttonRef,
    handleClick,
    clearBanner: () => setFailure(null),
  };
}
