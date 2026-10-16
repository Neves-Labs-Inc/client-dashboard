import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  getTaskIdAfterSave,
  getTriageBanner,
  isLinkingStatus,
  REQUESTS_COPY,
  TRIAGE_NOTE_FIELD,
  TRIAGE_STATUS_FIELD,
  TRIAGE_TASK_FIELD,
  type TriageOutcome,
} from "@/lib/admin-requests";
import { TEXT_MAX } from "@/lib/requests/request-rules";
import type { AdminRequestDetail } from "@/lib/requests/requests";
import { toast } from "@/lib/toast";

type TriageFormOptions = {
  request: AdminRequestDetail;
  // The detail route the save posts to.
  action: string;
  // Once the saved values are on the page.
  onSaved: () => void;
};

export type RequestTriageForm = {
  status: string;
  note: string;
  // "" for no Task. Kept while the Task select is hidden, so switching
  // back to Accepted or Done restores it.
  taskId: string;
  isTaskShown: boolean;
  noteError: string | null;
  // The refused or failed save's banner, until the next submit. It
  // outlives the form when the Request went read-only.
  banner: string | null;
  isSaving: boolean;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  bannerRef: React.RefObject<HTMLDivElement | null>;
  handleStatusChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleTaskChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleNoteChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleNoteBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

// Code points, as the module counts them (an emoji is one).
function isNoteTooLong(note: string): boolean {
  return Array.from(note.trim()).length > TEXT_MAX;
}

// The triage form's state and its one save, on a fetcher. An outcome is
// handled once the fetcher is idle again, so the page has revalidated into
// the saved (or read-only) state before the toast, highlight or focus move.
// Inputs keep their values on any refusal.
export function useRequestTriageForm({
  request,
  action,
  onSaved,
}: TriageFormOptions): RequestTriageForm {
  const fetcher = useFetcher<TriageOutcome>();
  const [status, setStatus] = useState<string>(request.status);
  const [note, setNote] = useState(request.responseNote ?? "");
  const [taskId, setTaskId] = useState(request.taskId ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const handledRef = useRef<TriageOutcome | undefined>(fetcher.data);
  // The status the last submit sent: the save clears the link unless it
  // keeps one.
  const submittedStatusRef = useRef(status);
  const isSaving = fetcher.state !== "idle";
  const isTaskShown = isLinkingStatus(status);

  // Each outcome is handled once; fetcher.data outlives the render.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "saved") {
      setTaskId((current) =>
        getTaskIdAfterSave(submittedStatusRef.current, current),
      );
      toast(REQUESTS_COPY.saved);
      onSaved();
    } else if (outcome.kind === "refused" && outcome.error === "invalid") {
      setNoteError(REQUESTS_COPY.noteTooLong);
      noteRef.current?.focus();
    } else {
      setBanner(getTriageBanner(outcome));
    }
  }, [fetcher.data, fetcher.state, onSaved]);

  // A new banner takes focus: after a read-only refusal the focused Save
  // button is gone.
  useEffect(() => {
    if (banner !== null) bannerRef.current?.focus();
  }, [banner]);

  function handleStatusChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void {
    setStatus(event.target.value);
  }

  function handleTaskChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    setTaskId(event.target.value);
  }

  function handleNoteChange(
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ): void {
    setNote(event.target.value);
    setNoteError(null);
  }

  function handleNoteBlur(event: React.FocusEvent<HTMLTextAreaElement>): void {
    // Going to Save: the error line would push the button away from the
    // click, and submit validates anyway.
    const target = event.relatedTarget;
    const isGoingToSubmit =
      target instanceof HTMLButtonElement && target.type === "submit";
    if (isGoingToSubmit) return;

    if (isNoteTooLong(note)) setNoteError(REQUESTS_COPY.noteTooLong);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) return;

    setBanner(null);
    if (isNoteTooLong(note)) {
      setNoteError(REQUESTS_COPY.noteTooLong);
      noteRef.current?.focus();
      return;
    }

    // No stale Task for a status that can't keep one.
    const fields: Record<string, string> = {
      [TRIAGE_STATUS_FIELD]: status,
      [TRIAGE_NOTE_FIELD]: note,
    };
    const payload = isTaskShown
      ? { ...fields, [TRIAGE_TASK_FIELD]: taskId }
      : fields;
    submittedStatusRef.current = status;
    void fetcher.submit(payload, { method: "post", action });
  }

  return {
    status,
    note,
    taskId,
    isTaskShown,
    noteError,
    banner,
    isSaving,
    noteRef,
    bannerRef,
    handleStatusChange,
    handleTaskChange,
    handleNoteChange,
    handleNoteBlur,
    handleSubmit,
  };
}
