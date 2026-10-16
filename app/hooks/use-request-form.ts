import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
  REQUEST_COPY,
  REQUEST_FIELD,
  REQUEST_INTENT_FIELD,
  type RequestOutcome,
} from "@/lib/request-outcome";
import {
  type FieldErrors,
  type RequestKind,
  validateDraft,
} from "@/lib/requests/request-rules";

export type RequestFormValues = {
  kind: RequestKind;
  title: string;
  description: string;
  // "" for no specific Project.
  projectId: string;
};

export const EMPTY_REQUEST: RequestFormValues = {
  kind: "BUG",
  title: "",
  description: "",
  projectId: "",
};

type TextField = "title" | "description" | "projectId";

// The fields an error can sit on, in DOM order: a failed submit focuses the
// first invalid one.
const FOCUS_ORDER: TextField[] = ["title", "description", "projectId"];

type RequestFormOptions = {
  isOpen: boolean;
  mode: "new" | "edit";
  // The values the form starts from (and is dirty against) on each open.
  initial: RequestFormValues;
  projectIds: readonly string[];
  // The route the form posts to.
  action: string;
  onSaved: (requestId: string) => void;
  // Edit only: the Request left New meanwhile.
  onNoLongerNew?: () => void;
};

type RequestForm = {
  values: RequestFormValues;
  fieldErrors: FieldErrors;
  banner: string | null;
  isDirty: boolean;
  // Submitting, then revalidating the page behind the drawer.
  isPending: boolean;
  // A `not-new` refusal: the form can't be submitted again.
  isLocked: boolean;
  fieldRefs: {
    title: React.RefObject<HTMLInputElement | null>;
    description: React.RefObject<HTMLTextAreaElement | null>;
    projectId: React.RefObject<HTMLSelectElement | null>;
  };
  handleKindChange: (kind: RequestKind) => void;
  handleChange: (
    field: TextField,
  ) => (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  handleBlur: (field: TextField) => () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function getFieldErrors(
  values: RequestFormValues,
  projectIds: readonly string[],
): FieldErrors {
  const validation = validateDraft(values, projectIds);
  return validation.isValid ? {} : validation.fieldErrors;
}

function isSameValues(a: RequestFormValues, b: RequestFormValues): boolean {
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    a.description === b.description &&
    a.projectId === b.projectId
  );
}

// The Request drawer's form: validation with the module's shared rules (on
// blur once edited, on submit, then live while an error shows), the post,
// and what follows its outcome. Starts fresh from `initial` each time
// `isOpen` turns true. An outcome is handled once the fetcher is idle, so a
// success closes the drawer onto the revalidated page.
export function useRequestForm({
  isOpen,
  mode,
  initial,
  projectIds,
  action,
  onSaved,
  onNoLongerNew,
}: RequestFormOptions): RequestForm {
  const fetcher = useFetcher<RequestOutcome>();
  const revalidator = useRevalidator();
  const [values, setValues] = useState(initial);
  const [edited, setEdited] = useState<ReadonlySet<TextField>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const handledRef = useRef<RequestOutcome | undefined>(fetcher.data);
  // The latest callbacks, so the outcome effect needn't re-run on them.
  const onSavedRef = useRef(onSaved);
  const onNoLongerNewRef = useRef(onNoLongerNew);
  const fieldRefs = {
    title: useRef<HTMLInputElement>(null),
    description: useRef<HTMLTextAreaElement>(null),
    projectId: useRef<HTMLSelectElement>(null),
  };
  const focusFirstInvalidRef = useRef((errors: FieldErrors): void => {
    const first = FOCUS_ORDER.find((field) => errors[field] !== undefined);
    if (first !== undefined) fieldRefs[first].current?.focus();
  });

  useEffect(() => {
    onSavedRef.current = onSaved;
    onNoLongerNewRef.current = onNoLongerNew;
  }, [onSaved, onNoLongerNew]);

  // Reset on open, not on close, so the closing drawer keeps its content
  // while it animates out.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setValues(initial);
      setEdited(new Set());
      setFieldErrors({});
      setBanner(null);
      setIsLocked(false);
    }
  }

  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "submitted" || outcome.kind === "updated") {
      onSavedRef.current(outcome.requestId);
    } else if (outcome.kind === "invalid") {
      setFieldErrors(outcome.fieldErrors);
      focusFirstInvalidRef.current(outcome.fieldErrors);
    } else if (outcome.kind === "not-new") {
      setBanner(REQUEST_COPY.notNew);
      setIsLocked(true);
      onNoLongerNewRef.current?.();
      // The page behind the drawer is stale: its controls must go.
      void revalidator.revalidate();
    } else {
      setBanner(
        mode === "new" ? REQUEST_COPY.submitFailed : REQUEST_COPY.saveFailed,
      );
    }
  }, [fetcher.data, fetcher.state, mode, revalidator]);

  function handleKindChange(kind: RequestKind): void {
    setValues((previous) => ({ ...previous, kind }));
  }

  function handleChange(field: TextField) {
    return (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ): void => {
      const next = { ...values, [field]: event.target.value };
      setValues(next);
      setEdited((previous) => new Set(previous).add(field));
      // A shown error re-checks live, so it clears once the value is valid.
      if (fieldErrors[field] !== undefined) {
        setFieldErrors((previous) => ({
          ...previous,
          [field]: getFieldErrors(next, projectIds)[field],
        }));
      }
    };
  }

  function handleBlur(field: TextField) {
    return (): void => {
      // Tabbing through an untouched field says nothing; a shown error stays.
      if (!edited.has(field) || fieldErrors[field] !== undefined) return;

      const error = getFieldErrors(values, projectIds)[field];
      setFieldErrors((previous) => ({ ...previous, [field]: error }));
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (fetcher.state !== "idle" || isLocked) return;

    const errors = getFieldErrors(values, projectIds);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidRef.current(errors);
      return;
    }
    setBanner(null);
    void fetcher.submit(
      {
        ...(mode === "edit" && { [REQUEST_INTENT_FIELD]: "edit" }),
        [REQUEST_FIELD.kind]: values.kind,
        [REQUEST_FIELD.title]: values.title,
        [REQUEST_FIELD.description]: values.description,
        [REQUEST_FIELD.projectId]: values.projectId,
      },
      { method: "post", action },
    );
  }

  return {
    values,
    fieldErrors,
    banner,
    isDirty: !isLocked && !isSameValues(values, initial),
    isPending: fetcher.state !== "idle",
    isLocked,
    fieldRefs,
    handleKindChange,
    handleChange,
    handleBlur,
    handleSubmit,
  };
}
