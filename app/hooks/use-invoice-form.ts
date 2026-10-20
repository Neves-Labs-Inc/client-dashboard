import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  type CreateInvoiceOutcome,
  getCreateBanner,
  INVOICE_FIELD,
  INVOICES_COPY,
} from "@/lib/admin-invoices";
import {
  type FieldErrors,
  getDefaultDueDate,
  type InvoiceDraft,
  LINE_ITEMS_MAX,
  parseAmount,
  validateInvoiceDraft,
} from "@/lib/invoices/invoice-rules";

// `key` is React's, stable while lines come and go.
export type InvoiceLine = { key: number; description: string; amount: string };

export type InvoiceFormValues = {
  // "" for none chosen; always "" with a fixed Client.
  clientId: string;
  issueDate: string;
  dueDate: string;
  // "" for no specific Project.
  projectId: string;
  memo: string;
  lines: InvoiceLine[];
};

type TopField = "clientId" | "issueDate" | "dueDate" | "projectId" | "memo";
type LineField = "description" | "amount";
type ChangeEvent = React.ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

// The global drawer's Client select. Without it, the Client is fixed by
// the route the form posts to.
type ClientChoice = {
  // The active Clients the select offers.
  clientIds: readonly string[];
  // "" for none.
  initialClientId: string;
};

type InvoiceFormOptions = {
  isOpen: boolean;
  // The New York date, from the loader.
  today: string;
  // The chosen Client's Projects ("" with a fixed Client).
  getProjectIds: (clientId: string) => readonly string[];
  clientChoice?: ClientChoice;
  // The route the form posts to.
  action: string;
  onCreated: (invoiceId: string, number: string) => void;
};

export type InvoiceForm = {
  values: InvoiceFormValues;
  // Keyed by the module's field paths ("lineItems.0.amount", "total").
  fieldErrors: FieldErrors;
  banner: string | null;
  isDirty: boolean;
  // Submitting, then revalidating the tab behind the drawer.
  isPending: boolean;
  // An archived or gone Client: the form can't be submitted again until
  // another Client is chosen.
  isLocked: boolean;
  // Invalid amounts count 0.
  totalCents: number;
  canAddLine: boolean;
  formRef: React.RefObject<HTMLFormElement | null>;
  handleChange: (field: TopField) => (event: ChangeEvent) => void;
  handleLineChange: (
    index: number,
    field: LineField,
  ) => (event: ChangeEvent) => void;
  // `key` is the field path.
  handleBlur: (key: string) => () => void;
  handleAddLine: () => void;
  handleRemoveLine: (index: number) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

const LINE_KEY_PATTERN = /^lineItems\.(\d+)\.(.+)$/;

function createInitialValues(
  today: string,
  clientId: string,
): InvoiceFormValues {
  return {
    clientId,
    issueDate: today,
    dueDate: getDefaultDueDate(today),
    projectId: "",
    memo: "",
    lines: [{ key: 0, description: "", amount: "" }],
  };
}

function toDraft(values: InvoiceFormValues): InvoiceDraft {
  return {
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    projectId: values.projectId,
    memo: values.memo,
    lineItems: values.lines.map(({ description, amount }) => ({
      description,
      amount,
    })),
  };
}

function toFormData(
  values: InvoiceFormValues,
  hasClientChoice: boolean,
): FormData {
  const form = new FormData();
  if (hasClientChoice) form.set(INVOICE_FIELD.clientId, values.clientId);
  form.set(INVOICE_FIELD.issueDate, values.issueDate);
  form.set(INVOICE_FIELD.dueDate, values.dueDate);
  form.set(INVOICE_FIELD.projectId, values.projectId);
  form.set(INVOICE_FIELD.memo, values.memo);
  for (const line of values.lines) {
    form.append(INVOICE_FIELD.description, line.description);
    form.append(INVOICE_FIELD.amount, line.amount);
  }
  return form;
}

function getTotalCents(lines: readonly InvoiceLine[]): number {
  return lines.reduce((sum, line) => {
    const amount = parseAmount(line.amount);
    return amount.isValid ? sum + amount.cents : sum;
  }, 0);
}

// The auto-followed due date doesn't count: only the Admin's own edits do.
function isSameAsInitial(
  values: InvoiceFormValues,
  initial: InvoiceFormValues,
  isDueTouched: boolean,
): boolean {
  const isSameLines =
    values.lines.length === initial.lines.length &&
    values.lines.every(
      (line, index) =>
        line.description === initial.lines[index].description &&
        line.amount === initial.lines[index].amount,
    );
  return (
    isSameLines &&
    values.clientId === initial.clientId &&
    values.issueDate === initial.issueDate &&
    (!isDueTouched || values.dueDate === initial.dueDate) &&
    values.projectId === initial.projectId &&
    values.memo === initial.memo
  );
}

// A field path once line `removed` is gone: later lines move up one, the
// removed line's paths go (null).
function shiftLineKey(key: string, removed: number): string | null {
  const match = LINE_KEY_PATTERN.exec(key);
  if (match === null) return key;

  const index = Number(match[1]);
  if (index === removed) return null;
  return index > removed ? `lineItems.${index - 1}.${match[2]}` : key;
}

function shiftErrors(errors: FieldErrors, removed: number): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).flatMap(([key, message]) => {
      const shifted = shiftLineKey(key, removed);
      return shifted === null ? [] : [[shifted, message]];
    }),
  );
}

function omitError(errors: FieldErrors, key: string): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([errorKey]) => errorKey !== key),
  );
}

function pickErrors(errors: FieldErrors, keys: readonly string[]): FieldErrors {
  return Object.fromEntries(
    keys.flatMap((key) =>
      errors[key] === undefined ? [] : [[key, errors[key]]],
    ),
  );
}

// The New invoice drawer's form: validation with the module's shared rules
// (on blur once edited, on submit, then live while an error shows), the due
// date following the issue date until edited, the Line Items repeater, the
// post and what follows its outcome. Starts fresh each time `isOpen` turns
// true. An outcome is handled once the fetcher is idle, so a success closes
// the drawer onto the revalidated tab. With `clientChoice`, the Client is a
// required field too, and the Project follows it.
export function useInvoiceForm({
  isOpen,
  today,
  getProjectIds,
  clientChoice,
  action,
  onCreated,
}: InvoiceFormOptions): InvoiceForm {
  const fetcher = useFetcher<CreateInvoiceOutcome>();
  const initial = createInitialValues(
    today,
    clientChoice?.initialClientId ?? "",
  );
  const [values, setValues] = useState(initial);
  const [isDueTouched, setIsDueTouched] = useState(false);
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const handledRef = useRef<CreateInvoiceOutcome | undefined>(fetcher.data);
  const nextLineKeyRef = useRef(1);
  const formRef = useRef<HTMLFormElement>(null);
  // The field path to focus once the lines re-render (after add or remove).
  const pendingFocusRef = useRef<string | null>(null);
  // The latest callback, so the outcome effect needn't re-run on it.
  const onCreatedRef = useRef(onCreated);
  const focusFirstInvalidRef = useRef((errors: FieldErrors): void => {
    const targets =
      formRef.current?.querySelectorAll<HTMLElement>("[data-field]");
    // A disabled field (the Client select with no Clients) can't take
    // focus: the next invalid one does.
    const first = Array.from(targets ?? []).find(
      (target) =>
        errors[target.dataset.field ?? ""] !== undefined &&
        !target.matches(":disabled"),
    );
    first?.focus();
  });

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  // Reset on open, not on close, so the closing drawer keeps its content
  // while it animates out.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setValues(initial);
      setIsDueTouched(false);
      setEdited(new Set());
      setFieldErrors({});
      setBanner(null);
      setIsLocked(false);
    }
  }

  useEffect(() => {
    const key = pendingFocusRef.current;
    if (key === null) return;

    pendingFocusRef.current = null;
    formRef.current
      ?.querySelector<HTMLElement>(`[data-field="${key}"]`)
      ?.focus();
  }, [values.lines]);

  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "created") {
      onCreatedRef.current(outcome.invoiceId, outcome.number);
    } else if (outcome.kind === "invalid") {
      setFieldErrors(outcome.fieldErrors);
      focusFirstInvalidRef.current(outcome.fieldErrors);
    } else {
      setBanner(getCreateBanner(outcome));
      setIsLocked(outcome.kind === "refused");
    }
  }, [fetcher.data, fetcher.state]);

  function getErrors(next: InvoiceFormValues): FieldErrors {
    const isClientMissing =
      clientChoice !== undefined &&
      !clientChoice.clientIds.includes(next.clientId);
    const validation = validateInvoiceDraft(
      toDraft(next),
      getProjectIds(next.clientId),
      today,
    );
    let errors = validation.isValid ? {} : validation.fieldErrors;
    if (isClientMissing) {
      errors = {
        [INVOICE_FIELD.clientId]: INVOICES_COPY.clientRequired,
        ...errors,
      };
    }
    return errors;
  }

  // A shown error re-checks live, so it clears once its value is valid.
  function update(
    next: InvoiceFormValues,
    shown: FieldErrors = fieldErrors,
  ): void {
    setValues(next);
    const shownKeys = Object.keys(shown);
    setFieldErrors(
      shownKeys.length === 0 ? shown : pickErrors(getErrors(next), shownKeys),
    );
  }

  function markEdited(key: string): void {
    setEdited((previous) => new Set(previous).add(key));
  }

  // Another Client's Projects differ: the Project resets, its error with it,
  // and a refusal of the previous Client no longer applies.
  function handleClientChange(clientId: string): void {
    markEdited("clientId");
    setIsLocked(false);
    update(
      { ...values, clientId, projectId: "" },
      omitError(fieldErrors, "projectId"),
    );
  }

  function handleChange(field: TopField) {
    return (event: ChangeEvent): void => {
      const value = event.target.value;
      if (field === "clientId") {
        handleClientChange(value);
        return;
      }

      let next = { ...values, [field]: value };
      if (field === "issueDate" && !isDueTouched) {
        next = { ...next, dueDate: getDefaultDueDate(value) };
      }
      if (field === "dueDate") setIsDueTouched(true);
      markEdited(field);
      update(next);
    };
  }

  function handleLineChange(index: number, field: LineField) {
    return (event: ChangeEvent): void => {
      const lines = values.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: event.target.value } : line,
      );
      markEdited(`lineItems.${index}.${field}`);
      update({ ...values, lines });
    };
  }

  function handleBlur(key: string) {
    return (): void => {
      // Tabbing through an untouched field says nothing; a shown error stays.
      if (!edited.has(key) || fieldErrors[key] !== undefined) return;

      const error = getErrors(values)[key];
      if (error !== undefined) {
        setFieldErrors((previous) => ({ ...previous, [key]: error }));
      }
    };
  }

  function handleAddLine(): void {
    if (values.lines.length >= LINE_ITEMS_MAX) return;

    const key = nextLineKeyRef.current;
    nextLineKeyRef.current += 1;
    pendingFocusRef.current = `lineItems.${values.lines.length}.description`;
    update({
      ...values,
      lines: [...values.lines, { key, description: "", amount: "" }],
    });
  }

  // Focus goes to the line that took its place, else the one before.
  function handleRemoveLine(index: number): void {
    if (values.lines.length <= 1) return;

    const lines = values.lines.filter((_, lineIndex) => lineIndex !== index);
    const focusIndex = Math.min(index, lines.length - 1);
    pendingFocusRef.current = `lineItems.${focusIndex}.description`;
    setEdited(
      (previous) =>
        new Set(
          Array.from(previous).flatMap((key) => {
            const shifted = shiftLineKey(key, index);
            return shifted === null ? [] : [shifted];
          }),
        ),
    );
    update({ ...values, lines }, shiftErrors(fieldErrors, index));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (fetcher.state !== "idle" || isLocked) return;

    const errors = getErrors(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidRef.current(errors);
      return;
    }
    setBanner(null);
    void fetcher.submit(toFormData(values, clientChoice !== undefined), {
      method: "post",
      action,
    });
  }

  return {
    values,
    fieldErrors,
    banner,
    isDirty: !isLocked && !isSameAsInitial(values, initial, isDueTouched),
    isPending: fetcher.state !== "idle",
    isLocked,
    totalCents: getTotalCents(values.lines),
    canAddLine: values.lines.length < LINE_ITEMS_MAX,
    formRef,
    handleChange,
    handleLineChange,
    handleBlur,
    handleAddLine,
    handleRemoveLine,
    handleSubmit,
  };
}
