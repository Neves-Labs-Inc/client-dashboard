import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { ADMIN_PATH, getPasskeySignInError } from "@/hooks/use-passkey-sign-in";
import { registerPasskey, signInWithPasskey } from "@/lib/auth/auth-client";

const REGISTER_FAILED = "Passkey registration didn't finish. Try again.";

// idle → registering → (register-failed | signing-in);
// signing-in → (navigating to /admin | sign-in-failed).
export type RegistrationPhase =
  "idle" | "registering" | "register-failed" | "signing-in" | "sign-in-failed";

type PasskeyRegistration = {
  phase: RegistrationPhase;
  error: string | null;
  // Once true it stays true: the screen never offers a second registration.
  isRegistered: boolean;
  isPending: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  // The one primary button: register, or retry the sign-in once registered.
  handlePrimary: () => Promise<void>;
};

// /passkey: register a passkey from the magic-link session, then sign in
// with it at once, which swaps the session for a passkey one.
export function usePasskeyRegistration(): PasskeyRegistration {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<RegistrationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isPending = phase === "registering" || phase === "signing-in";

  // Re-enables the button synchronously so focus can return to it (the
  // browser prompt took it); the alert banner announces the failure.
  function fail(nextPhase: RegistrationPhase, message: string): void {
    flushSync(() => {
      setPhase(nextPhase);
      setError(message);
    });
    buttonRef.current?.focus();
  }

  async function signIn(): Promise<void> {
    setError(null);
    setPhase("signing-in");
    const outcome = await signInWithPasskey();
    if (outcome === "signed-in") {
      // Stays pending until /admin renders, so the idle label never flashes.
      await navigate(ADMIN_PATH);
    } else {
      fail("sign-in-failed", getPasskeySignInError(outcome));
    }
  }

  async function register(): Promise<void> {
    setError(null);
    setPhase("registering");
    const outcome = await registerPasskey();
    if (outcome === "registered") {
      await signIn();
    } else {
      fail("register-failed", REGISTER_FAILED);
    }
  }

  async function handlePrimary(): Promise<void> {
    if (isPending) return;

    const isRegistered = phase === "sign-in-failed";
    await (isRegistered ? signIn() : register());
  }

  return {
    phase,
    error,
    isRegistered: phase === "signing-in" || phase === "sign-in-failed",
    isPending,
    buttonRef,
    handlePrimary,
  };
}
