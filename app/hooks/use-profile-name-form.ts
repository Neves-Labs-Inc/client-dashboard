import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  PROFILE_COPY,
  PROFILE_INTENT_FIELD,
  PROFILE_NAME_FIELD,
  PROFILE_PATH,
  type ProfileOutcome,
} from "@/lib/profile";
import { toast } from "@/lib/toast";
import { isValidUserName, normalizeUserName } from "@/lib/user-name";

type ProfileNameForm = {
  name: string;
  fieldError: string | null;
  banner: string | null;
  isSaving: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

// The Details form's rename. The field error needs one edit before blur
// shows it, and clears on the next change; a server or network failure is a
// banner that keeps the typed value. Not optimistic: the stored name comes
// back with the revalidated page.
export function useProfileNameForm(storedName: string): ProfileNameForm {
  const fetcher = useFetcher<ProfileOutcome>();
  const [name, setName] = useState(storedName);
  const [isErrorShown, setIsErrorShown] = useState(false);
  const [isBannerShown, setIsBannerShown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditedRef = useRef(false);
  // What the last submit sent, to tell an edit made while it was saving.
  const submittedRef = useRef("");
  const handledRef = useRef<ProfileOutcome | undefined>(fetcher.data);
  const isSaving =
    fetcher.state !== "idle" &&
    fetcher.formData?.get(PROFILE_INTENT_FIELD) === "rename";

  // Each outcome is handled once; fetcher.data outlives the render.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state === "submitting" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "renamed") {
      // Typing on during the save keeps that newer, unsaved edit.
      const isUnchanged = name === submittedRef.current;
      if (isUnchanged) {
        setName(normalizeUserName(name));
        isEditedRef.current = false;
      }
      toast(PROFILE_COPY.nameSaved);
    } else if (outcome.kind === "refused") {
      setIsErrorShown(true);
      inputRef.current?.focus();
    } else {
      setIsBannerShown(true);
    }
    // Only a new outcome matters, not the typed value read alongside it.
  }, [fetcher.data, fetcher.state]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    isEditedRef.current = true;
    setName(event.target.value);
    setIsErrorShown(false);
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>): void {
    // Going to Save: the error line would push the button away from the
    // click, and submit validates anyway.
    const target = event.relatedTarget;
    const isGoingToSubmit =
      target instanceof HTMLButtonElement && target.type === "submit";
    if (isGoingToSubmit) return;

    if (isEditedRef.current && !isValidUserName(name)) setIsErrorShown(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) return;

    setIsBannerShown(false);
    if (!isValidUserName(name)) {
      setIsErrorShown(true);
      inputRef.current?.focus();
      return;
    }

    submittedRef.current = name;
    void fetcher.submit(
      { [PROFILE_INTENT_FIELD]: "rename", [PROFILE_NAME_FIELD]: name },
      { method: "post", action: PROFILE_PATH },
    );
  }

  return {
    name,
    fieldError: isErrorShown ? PROFILE_COPY.invalidName : null,
    banner: isBannerShown ? PROFILE_COPY.saveFailed : null,
    isSaving,
    inputRef,
    handleChange,
    handleBlur,
    handleSubmit,
  };
}
