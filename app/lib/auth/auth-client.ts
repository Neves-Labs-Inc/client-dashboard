import {
  PASSKEY_ERROR_CODES,
  passkeyClient,
} from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// The browser's one Better Auth client (ADR 0001 allows it for the
// magic-link request, the Google redirect and the WebAuthn ceremonies). UI
// code calls the functions below, never the client itself.

const TOO_MANY_REQUESTS = 429;
// Where a bad or reused emailed link lands (Better Auth adds ?error=).
const MAGIC_LINK_ERROR_CALLBACK_URL = "/sign-in";
const GOOGLE_PROVIDER = "google";
// Where a failed Google round trip lands (state mismatch, consent denied):
// Better Auth adds &error=, and the flag picks the Google banner. A refused
// sign-in goes to /no-access instead (the server's redirect).
export const GOOGLE_ERROR_FLAG = "google";
const GOOGLE_ERROR_CALLBACK_URL = `/sign-in?${GOOGLE_ERROR_FLAG}`;
// What the browser library reports when its ceremony was aborted (by a newer
// ceremony, e.g. the button superseding autofill), not refused by the user.
const CEREMONY_ABORTED = "ERROR_CEREMONY_ABORTED";

export type MagicLinkOutcome = "sent" | "rate-limited" | "failed";
// "redirecting": the browser is leaving for Google.
export type GoogleSignInOutcome = "redirecting" | "failed";
export type PasskeyRegistrationOutcome = "registered" | "failed";
// "aborted": superseded by another ceremony. "cancelled": the browser's
// ceremony ended without a passkey (dismissed, or no authenticator), so the
// server never saw one; for autofill, also any failure before a passkey was
// chosen (e.g. the options request). "failed": anything else, e.g. the
// server refused it.
export type PasskeySignInOutcome =
  "signed-in" | "aborted" | "cancelled" | "rate-limited" | "failed";

type AuthClientError = { status: number; code?: string; message?: string };

type AuthClient = ReturnType<typeof buildAuthClient>;

let client: AuthClient | null = null;

// Built on first use, in the browser, so it targets the page's own origin.
function getAuthClient(): AuthClient {
  client ??= buildAuthClient();
  return client;
}

function buildAuthClient() {
  return createAuthClient({ plugins: [magicLinkClient(), passkeyClient()] });
}

// "sent" whatever the email: the server decides who is mailed and answers
// every address the same way. `callbackURL` is where the opened link lands:
// a same-origin path ("/" from /sign-in, routing each access home).
export async function requestMagicLink(
  email: string,
  callbackURL: string,
): Promise<MagicLinkOutcome> {
  let outcome: MagicLinkOutcome;
  try {
    const { error } = await getAuthClient().signIn.magicLink({
      email,
      callbackURL,
      errorCallbackURL: MAGIC_LINK_ERROR_CALLBACK_URL,
    });
    if (error === null) {
      outcome = "sent";
    } else {
      outcome = error.status === TOO_MANY_REQUESTS ? "rate-limited" : "failed";
      console.warn(`auth-client: magic-link request failed (${error.status})`);
    }
  } catch (error) {
    // A network failure throws instead of returning an error.
    console.warn("auth-client: magic-link request threw", error);
    outcome = "failed";
  }
  return outcome;
}

// Starts the Google redirect; Google sends the browser back to `callbackURL`
// (a same-origin path) once signed in. On success the page is unloading, so
// callers stay pending.
export async function signInWithGoogle(
  callbackURL: string,
): Promise<GoogleSignInOutcome> {
  let outcome: GoogleSignInOutcome;
  try {
    const { error } = await getAuthClient().signIn.social({
      provider: GOOGLE_PROVIDER,
      callbackURL,
      errorCallbackURL: GOOGLE_ERROR_CALLBACK_URL,
    });
    outcome = error === null ? "redirecting" : "failed";
    if (error !== null) {
      console.warn(`auth-client: Google sign-in failed (${error.status})`);
    }
  } catch (error) {
    // A network failure throws instead of returning an error.
    console.warn("auth-client: Google sign-in threw", error);
    outcome = "failed";
  }
  return outcome;
}

// Adds a passkey to the signed-in Admin (the magic-link session). It never
// signs in: the session comes from signInWithPasskey afterwards.
export async function registerPasskey(): Promise<PasskeyRegistrationOutcome> {
  let outcome: PasskeyRegistrationOutcome;
  try {
    const { error } = await getAuthClient().passkey.addPasskey();
    outcome = error === null ? "registered" : "failed";
    if (error !== null) logPasskeyError("registration", error);
  } catch (error) {
    console.warn("auth-client: passkey registration threw", error);
    outcome = "failed";
  }
  return outcome;
}

// The WebAuthn sign-in. With `autoFill`, it waits on the Email field's
// passkey suggestions (conditional mediation) instead of opening a prompt.
export async function signInWithPasskey({
  autoFill = false,
}: { autoFill?: boolean } = {}): Promise<PasskeySignInOutcome> {
  let outcome: PasskeySignInOutcome;
  // fetchOptions reach only the verify request, so this says whether a
  // chosen passkey got to the server.
  let isVerifying = false;
  try {
    const { error } = await getAuthClient().signIn.passkey({
      autoFill,
      fetchOptions: {
        onRequest: () => {
          isVerifying = true;
        },
      },
    });
    outcome = error === null ? "signed-in" : toSignInFailure(error);
    if (error !== null && outcome !== "aborted") {
      logPasskeyError("sign-in", error);
    }
  } catch (error) {
    // A network failure throws instead of returning an error.
    console.warn("auth-client: passkey sign-in threw", error);
    outcome = "failed";
  }
  // Autofill runs unasked, so a failure before any passkey was chosen (the
  // options request) is no attempt of the user's.
  if (autoFill && !isVerifying && outcome !== "signed-in") {
    outcome = "cancelled";
  }
  // The plugin reports a verify request that threw (network) as cancelled,
  // but a chosen passkey did reach for the server.
  if (autoFill && isVerifying && outcome === "cancelled") {
    outcome = "failed";
  }
  return outcome;
}

// Whether the browser can offer passkeys in the Email field's autofill.
export async function isPasskeyAutofillAvailable(): Promise<boolean> {
  const isSupported =
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential?.isConditionalMediationAvailable ===
      "function";
  return isSupported && PublicKeyCredential.isConditionalMediationAvailable();
}

function toSignInFailure(error: AuthClientError): PasskeySignInOutcome {
  let outcome: PasskeySignInOutcome = "failed";
  if (error.code === CEREMONY_ABORTED) {
    outcome = "aborted";
  } else if (error.message === PASSKEY_ERROR_CODES.AUTH_CANCELLED.message) {
    outcome = "cancelled";
  } else if (error.status === TOO_MANY_REQUESTS) {
    outcome = "rate-limited";
  }
  return outcome;
}

function logPasskeyError(ceremony: string, error: AuthClientError): void {
  const code = error.code ? ` ${error.code}` : "";
  console.warn(
    `auth-client: passkey ${ceremony} failed (${error.status}${code})`,
  );
}
