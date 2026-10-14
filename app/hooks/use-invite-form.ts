import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { INVITE_EMAIL_COPY, normalizeInviteEmail } from "@/lib/invite-email";
import {
  INVITATION_COPY,
  INVITATION_INTENT_FIELD,
  INVITE_EMAIL_FIELD,
  type InvitationOutcome,
  type InviteFeedback,
  type RefusalCode,
} from "@/lib/team-invitations";

type InviteForm = {
  email: string;
  fieldError: string | null;
  banner: string | null;
  isDirty: boolean;
  isPending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function getEmailError(email: string): string | null {
  return normalizeInviteEmail(email) === null
    ? INVITE_EMAIL_COPY.invalid
    : null;
}

// The invite drawer's form: validation (on blur and on submit, then live
// while an error shows), the post, and what follows its outcome. Starts
// fresh each time `isOpen` turns true. It posts to `action`; `getFeedback`
// words a refusal for this surface.
export function useInviteForm(
  isOpen: boolean,
  action: string,
  getFeedback: (error: RefusalCode) => InviteFeedback,
  onSent: (invitationId: string) => void,
): InviteForm {
  const fetcher = useFetcher<InvitationOutcome>();
  const revalidator = useRevalidator();
  const [email, setEmail] = useState("");
  const [isEdited, setIsEdited] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const handledRef = useRef<InvitationOutcome | undefined>(fetcher.data);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open, not on close, so the closing drawer keeps its content
  // while it animates out.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setEmail("");
      setIsEdited(false);
      setFieldError(null);
      setBanner(null);
    }
  }

  // Each outcome is handled once. A success arrives while the page
  // revalidates (the fetcher is "loading"), so the drawer closes at once.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state === "submitting" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "sent") {
      onSent(outcome.invitationId);
    } else if (outcome.kind === "refused") {
      const feedback = getFeedback(outcome.error);
      if (feedback.target === "field") {
        setFieldError(feedback.message);
      } else {
        setBanner(feedback.message);
        // The page behind the drawer is stale.
        void revalidator.revalidate();
      }
      inputRef.current?.focus();
    } else {
      setBanner(INVITATION_COPY.inviteFailed);
      inputRef.current?.focus();
    }
  }, [fetcher.data, fetcher.state, getFeedback, onSent, revalidator]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setEmail(next);
    setIsEdited(true);
    if (fieldError !== null) setFieldError(getEmailError(next));
  }

  function handleBlur(): void {
    // Tabbing through an untouched field says nothing; a shown error stays.
    if (!isEdited || fieldError !== null) return;

    setFieldError(getEmailError(email));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (fetcher.state !== "idle") return;

    const error = getEmailError(email);
    setFieldError(error);
    if (error !== null) {
      inputRef.current?.focus();
      return;
    }
    setBanner(null);
    void fetcher.submit(
      { [INVITATION_INTENT_FIELD]: "invite", [INVITE_EMAIL_FIELD]: email },
      { method: "post", action },
    );
  }

  return {
    email,
    fieldError,
    banner,
    isDirty: email.trim() !== "",
    // Through the revalidation after a send, while the drawer closes.
    isPending: fetcher.state !== "idle",
    inputRef,
    handleChange,
    handleBlur,
    handleSubmit,
  };
}
