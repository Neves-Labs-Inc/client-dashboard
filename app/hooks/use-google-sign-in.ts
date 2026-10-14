import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { signInWithGoogle } from "@/lib/auth/auth-client";

const START_FAILED = "Couldn't start Google sign-in. Try again.";

type GoogleSignInOptions = {
  // Where Google sends the browser back to once signed in.
  callbackURL: string;
  // Called as an attempt starts, so the page can clear its other banners.
  onAttempt?: () => void;
};

type GoogleSignIn = {
  banner: string | null;
  isPending: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  handleClick: () => Promise<void>;
  clearBanner: () => void;
};

// The "Continue with Google" button: the redirect start and its one banner.
export function useGoogleSignIn({
  callbackURL,
  onAttempt,
}: GoogleSignInOptions): GoogleSignIn {
  const [isPending, setIsPending] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function handleClick(): Promise<void> {
    if (isPending) return;

    onAttempt?.();
    setHasFailed(false);
    setIsPending(true);
    const outcome = await signInWithGoogle(callbackURL);
    // On success the browser is leaving: it stays pending until it does.
    if (outcome === "failed") {
      // Re-enable synchronously so focus can return to the button; the alert
      // banner announces the failure.
      flushSync(() => {
        setIsPending(false);
        setHasFailed(true);
      });
      buttonRef.current?.focus();
    }
  }

  return {
    banner: hasFailed ? START_FAILED : null,
    isPending,
    buttonRef,
    handleClick,
    clearBanner: () => setHasFailed(false),
  };
}
