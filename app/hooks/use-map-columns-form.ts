import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type {
  ClientStatus,
  Mapping,
  MappingEdit,
  SaveMappingError,
} from "@/lib/board-sync/board-sync";
import { INTENT_FIELD, MAPPING_FIELD_PREFIX } from "@/lib/link-board";
import {
  getSaveFailure,
  MAP_COPY,
  PROJECT_ID_FIELD,
  SAVE_MAPPING_INTENT,
  type SaveMappingOutcome,
} from "@/lib/projects";
import { toast } from "@/lib/toast";

type MapColumnsFormOptions = {
  projectId: string | null;
  // Undefined while loading; null, or "failed", when it can't be shown.
  mapping: MappingEdit | null | "failed" | undefined;
  // The Projects route the mapping posts to.
  action: string;
  onSaved: (projectId: string) => void;
};

export type MapColumnsForm = {
  // The stored options with the Admin's edits applied.
  values: Mapping;
  isDirty: boolean;
  isPending: boolean;
  // The last save's failure, until the next attempt.
  banner: string | null;
  // Set by a refusal: retrying can't succeed.
  refusal: SaveMappingError | null;
  handleChange: (optionId: string, status: ClientStatus | null) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

// The Map columns drawer's form: the edits over the loaded mapping, the
// post, and what follows its outcome. Starts fresh whenever a new mapping
// loads.
export function useMapColumnsForm({
  projectId,
  mapping,
  action,
  onSaved,
}: MapColumnsFormOptions): MapColumnsForm {
  const fetcher = useFetcher<SaveMappingOutcome>();
  const [edits, setEdits] = useState<Mapping>({});
  const [seenMapping, setSeenMapping] = useState(mapping);
  const [banner, setBanner] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<SaveMappingError | null>(null);
  const handledRef = useRef<SaveMappingOutcome | undefined>(fetcher.data);
  const options = typeof mapping === "object" ? (mapping?.options ?? []) : [];
  const isPending = fetcher.state !== "idle";

  // Reset when a mapping loads, not when the drawer closes, so the closing
  // drawer keeps its content while it animates out.
  if (mapping !== seenMapping) {
    setSeenMapping(mapping);
    setEdits({});
    setBanner(null);
    setRefusal(null);
  }

  // Each outcome is handled once, after the page has revalidated, so the
  // row shows its new count as it highlights.
  useEffect(() => {
    const outcome = fetcher.data;
    if (fetcher.state !== "idle" || !outcome) return;
    if (outcome === handledRef.current) return;

    handledRef.current = outcome;
    if (outcome.kind === "saved") {
      toast(MAP_COPY.saved);
      if (projectId !== null) onSaved(projectId);
    } else {
      setBanner(getSaveFailure(outcome));
      if (outcome.kind === "refused") setRefusal(outcome.error);
    }
  }, [fetcher.data, fetcher.state, projectId, onSaved]);

  const values = Object.fromEntries(
    options.map((option) => [
      option.id,
      Object.hasOwn(edits, option.id) ? edits[option.id] : option.clientStatus,
    ]),
  );
  const isDirty = options.some(
    (option) => values[option.id] !== option.clientStatus,
  );

  function handleChange(optionId: string, status: ClientStatus | null): void {
    setEdits((previous) => ({ ...previous, [optionId]: status }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending || projectId === null || options.length === 0) return;

    // A new attempt: the last failure no longer applies.
    setBanner(null);
    const form = new FormData();
    form.set(INTENT_FIELD, SAVE_MAPPING_INTENT);
    form.set(PROJECT_ID_FIELD, projectId);
    for (const option of options) {
      form.set(`${MAPPING_FIELD_PREFIX}${option.id}`, values[option.id] ?? "");
    }
    void fetcher.submit(form, { method: "post", action });
  }

  return {
    values,
    isDirty,
    isPending,
    banner,
    refusal,
    handleChange,
    handleSubmit,
  };
}
