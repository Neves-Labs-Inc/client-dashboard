import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { getClientNameError, normalizeClientName } from "@/lib/client-name";
import {
  CREATE_CLIENT_ACTION,
  getCreatedTeamHref,
  toCreatedClientState,
  type CreateClientOutcome,
} from "@/lib/new-client";

export const CREATE_CLIENT_FAILED = "Couldn't create the Client. Try again.";

type CreateClientForm = {
  name: string;
  fieldError: string | null;
  banner: string | null;
  isDirty: boolean;
  // Submitting, or created and on the way to the Team tab.
  isPending: boolean;
  // Once created, the drawer must not return focus: the Team h1 takes it.
  isCreated: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  submitRef: React.RefObject<HTMLButtonElement | null>;
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

// The create-Client drawer's form: validation (on submit, on blur once
// edited, then live), the post, and what follows its outcome. Starts fresh
// each time `isOpen` turns true.
export function useCreateClientForm(isOpen: boolean): CreateClientForm {
  const fetcher = useFetcher<CreateClientOutcome>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [isEdited, setIsEdited] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isCreated, setIsCreated] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const handledRef = useRef<CreateClientOutcome | undefined>(fetcher.data);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Reset on open, not on close, so the closing drawer keeps its content
  // while it animates out.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setName("");
      setIsEdited(false);
      setFieldError(null);
      setBanner(null);
      setIsCreated(false);
    }
  }

  // Each outcome is handled once (a reopened drawer must not replay one).
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome || outcome === handledRef.current)
      return;

    handledRef.current = outcome;
    if (outcome.kind === "created") {
      setIsCreated(true);
      // Replace: Back mustn't reopen an empty drawer at /admin?new=client.
      // No toast here: the Team tab's invite drawer opening confirms it.
      void navigate(getCreatedTeamHref(outcome.clientId), {
        replace: true,
        state: toCreatedClientState(outcome.clientId),
      });
    } else if (outcome.kind === "invalid") {
      setFieldError(outcome.fieldError);
      inputRef.current?.focus();
    } else {
      setBanner(CREATE_CLIENT_FAILED);
      submitRef.current?.focus();
    }
  }, [fetcher.data, fetcher.state, navigate]);

  const isPending = fetcher.state !== "idle" || isCreated;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setName(next);
    setIsEdited(true);
    // A shown error re-checks live, so it clears once the value is valid
    // (and a duplicate clears on any edit).
    if (fieldError !== null) setFieldError(getClientNameError(next));
  }

  function handleBlur(): void {
    // Tabbing through an untouched field says nothing; a shown error stays.
    if (!isEdited || fieldError !== null) return;

    setFieldError(getClientNameError(name));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;

    const error = getClientNameError(name);
    setFieldError(error);
    if (error !== null) {
      inputRef.current?.focus();
      return;
    }
    setBanner(null);
    void fetcher.submit(
      { name: normalizeClientName(name) },
      { method: "post", action: CREATE_CLIENT_ACTION },
    );
  }

  return {
    name,
    fieldError,
    banner,
    isDirty: name.trim() !== "",
    isPending,
    isCreated,
    inputRef,
    submitRef,
    handleChange,
    handleBlur,
    handleSubmit,
  };
}
