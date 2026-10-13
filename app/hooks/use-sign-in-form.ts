import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import {
  requestMagicLink,
  type MagicLinkOutcome,
} from "@/lib/auth/auth-client";

export const CHECK_EMAIL_PATH = "/sign-in/check-email";

const INVALID_EMAIL = "Enter a valid email.";
// Deliberately loose: the browser's type="email" rule plus a dot in the
// domain. The server decides who gets an email.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Banners the server renders: a bad emailed link, or a form submitted
// before the page could send the request itself.
export type InitialBanner = "bad-link" | "failed" | null;

type Banner = Exclude<MagicLinkOutcome, "sent"> | "bad-link";

const BANNER_COPY: Record<Banner, string> = {
  "bad-link":
    "That sign-in link has expired or was already used. Request a new one.",
  "rate-limited": "Too many attempts. Try again in a minute.",
  failed: "Couldn't send the link. Try again.",
};

type SignInForm = {
  email: string;
  fieldError: string | null;
  banner: string | null;
  isPending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  // For the page's other banner source (passkey sign-in): one at a time.
  clearBanner: () => void;
};

// The magic-link form: validation, the request, and the one banner at a
// time. `initialBanner` is the server-rendered banner, if any.
export function useSignInForm(initialBanner: InitialBanner): SignInForm {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isErrorShown, setIsErrorShown] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(initialBanner);
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setEmail(next);
    // Once shown, the error clears the moment the value is valid.
    if (isValidEmail(next)) setIsErrorShown(false);
  }

  // The DOM is the truth: text typed or autofilled before hydration never
  // fired onChange, so it isn't in state yet.
  function readEmail(): string {
    const value = inputRef.current?.value ?? email;
    if (value !== email) setEmail(value);
    return value;
  }

  function handleBlur(): void {
    const value = readEmail();
    // An empty field is flagged on submit only, so tabbing past doesn't scold.
    const isFilled = value.trim() !== "";
    if (isFilled && !isValidEmail(value)) setIsErrorShown(true);
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (isPending) return;

    const value = readEmail();
    setBanner(null);
    if (!isValidEmail(value)) {
      setIsErrorShown(true);
      inputRef.current?.focus();
      return;
    }

    setIsPending(true);
    const outcome = await requestMagicLink(value.trim());
    if (outcome === "sent") {
      // Stays pending until the next screen loads, so it never flashes idle.
      await navigate(CHECK_EMAIL_PATH);
    } else {
      // Re-enable synchronously so focus can return to the button, which
      // lost it while disabled; the alert banner announces the failure.
      flushSync(() => {
        setIsPending(false);
        setBanner(outcome);
      });
      buttonRef.current?.focus();
    }
  }

  return {
    email,
    fieldError: isErrorShown ? INVALID_EMAIL : null,
    banner: banner === null ? null : BANNER_COPY[banner],
    isPending,
    inputRef,
    buttonRef,
    handleChange,
    handleBlur,
    handleSubmit,
    clearBanner: () => setBanner(null),
  };
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
