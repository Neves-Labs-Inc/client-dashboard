import { useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router";
import type {
  ClientStatus,
  LinkDraft,
  Mapping,
  UnassignedBoard,
} from "@/lib/board-sync/board-sync";
import {
  BOARD_FIELD,
  CLIENT_FIELD,
  getLinkDraftPath,
  getLinkFailure,
  getOpenerBoardTitle,
  getProjectsPath,
  INTENT_FIELD,
  LINK_ACTION,
  LINK_COPY,
  LINK_INTENT,
  MAPPING_FIELD_PREFIX,
  OPTIONS_FIELD,
  toLinkedProjectState,
  type LinkDraftOutcome,
  type LinkOutcome,
} from "@/lib/link-board";

type ClientOption = { id: string; name: string };

// loading: the options are on their way. failed: GitHub (or the request)
// failed, so the drawer can't link. unavailable: the board can't be linked
// any more.
export type DraftStatus = "loading" | "ready" | "failed" | "unavailable";

export type LinkBoardForm = {
  // The board shown, kept while the drawer animates out.
  boardNodeId: string | null;
  boardTitle: string | null;
  draftStatus: DraftStatus;
  draft: LinkDraft | null;
  clientId: string;
  clientError: string | null;
  // The Client whose frozen copy this link revives, if any.
  relinkClientName: string | null;
  mapping: Mapping;
  banner: string | null;
  isDirty: boolean;
  isRetrying: boolean;
  // Submitting, or linked and on the way to the Projects tab.
  isPending: boolean;
  // Once linked, the drawer must not return focus: the tab's h1 takes it.
  isLinked: boolean;
  clientSelectRef: React.RefObject<HTMLSelectElement | null>;
  columnsRef: React.RefObject<HTMLDivElement | null>;
  handleClientChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleMappingChange: (optionId: string, status: ClientStatus | null) => void;
  handleRetry: () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

// The Link drawer's form: the live draft (options and frozen mappings), the
// Client and column choices with their pre-fill, the post, and what follows
// its outcome. Starts fresh each time a board's drawer opens.
export function useLinkBoardForm(
  openNodeId: string | null,
  clients: ClientOption[],
  // Home's streamed pool: the title on a reloaded `?link=` URL whose draft
  // failed.
  poolBoards: Promise<UnassignedBoard[] | "github-off" | null>,
): LinkBoardForm {
  // The URL's board as last seen, and the board shown (kept on close).
  const [seenNodeId, setSeenNodeId] = useState<string | null>(null);
  const [boardNodeId, setBoardNodeId] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState(0);
  // A fresh fetcher per opening, so a reopened drawer never shows an old
  // draft while the new one loads.
  const draftFetcher = useFetcher<LinkDraftOutcome>({
    key: `link-draft-${openCount}`,
  });
  const linkFetcher = useFetcher<LinkOutcome>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { state: locationState } = useLocation();
  const [chosenClientId, setChosenClientId] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [isMappingEdited, setIsMappingEdited] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const handledLinkRef = useRef<LinkOutcome | undefined>(linkFetcher.data);
  const handledDraftRef = useRef<LinkDraftOutcome | undefined>(undefined);
  const loadedOpenRef = useRef(0);
  const clientSelectRef = useRef<HTMLSelectElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const { load } = draftFetcher;
  // A Client that left the list (archived or gone, after a refusal) is no
  // longer chosen: the select shows the placeholder, and the submit agrees.
  const clientId = clients.some((client) => client.id === chosenClientId)
    ? chosenClientId
    : "";
  const poolTitle = usePoolTitle(poolBoards, boardNodeId);

  // Reset on open, not on close, so the closing drawer keeps its content
  // while it animates out.
  if (openNodeId !== seenNodeId) {
    setSeenNodeId(openNodeId);
    if (openNodeId !== null) {
      setBoardNodeId(openNodeId);
      setOpenCount((count) => count + 1);
      setChosenClientId("");
      setClientError(null);
      setMapping({});
      setIsMappingEdited(false);
      setBanner(null);
      setIsLinked(false);
      setIsRetrying(false);
    }
  }

  // Once per opening, with that opening's fetcher.
  useEffect(() => {
    if (boardNodeId === null || loadedOpenRef.current === openCount) return;

    loadedOpenRef.current = openCount;
    void load(getLinkDraftPath(boardNodeId));
  }, [openCount, boardNodeId, load]);

  const outcome =
    draftFetcher.data?.boardNodeId === boardNodeId
      ? draftFetcher.data
      : undefined;
  const draftStatus = getDraftStatus(outcome);
  const draft = outcome?.kind === "ready" ? outcome : null;

  // Each draft is handled once: a pre-fill for a Client chosen while it
  // loaded, a refresh of Home when the board turned out unavailable, and
  // focus after a successful retry.
  useEffect(() => {
    if (draftFetcher.state !== "idle" || outcome === undefined) return;
    if (outcome === handledDraftRef.current) return;

    handledDraftRef.current = outcome;
    if (outcome.kind === "ready") {
      if (clientId !== "" && !isMappingEdited) {
        setMapping(getPrefill(outcome, clientId));
      }
      if (isRetrying) {
        const firstSelect = columnsRef.current?.querySelector("select");
        (firstSelect ?? clientSelectRef.current)?.focus();
      }
    } else if (
      outcome.kind === "refused" &&
      outcome.error !== "github-failed"
    ) {
      void revalidator.revalidate();
    }
    setIsRetrying(false);
  }, [
    draftFetcher.state,
    outcome,
    clientId,
    isMappingEdited,
    isRetrying,
    revalidator,
  ]);

  // Each link outcome is handled once (a reopened drawer must not replay
  // one).
  useEffect(() => {
    const linked = linkFetcher.data;
    if (linkFetcher.state !== "idle" || !linked) return;
    if (linked === handledLinkRef.current) return;

    handledLinkRef.current = linked;
    if (linked.kind === "linked") {
      setIsLinked(true);
      // Replace: Back mustn't reopen the drawer at /admin?link=….
      void navigate(getProjectsPath(linked.clientId), {
        replace: true,
        state: toLinkedProjectState(linked.projectId, linked.firstSyncFailed),
      });
    } else {
      setBanner(getLinkFailure(linked));
      // A Client or board that changed underneath: refresh the lists.
      if (linked.kind === "refused") void revalidator.revalidate();
    }
  }, [linkFetcher.data, linkFetcher.state, navigate, revalidator]);

  const isPending = linkFetcher.state !== "idle" || isLinked;
  const frozenMapping =
    draft && clientId ? draft.frozenMappings[clientId] : null;
  const relinkClientName = frozenMapping
    ? (clients.find((client) => client.id === clientId)?.name ?? null)
    : null;

  function handleClientChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void {
    const next = event.target.value;
    setChosenClientId(next);
    if (clientError !== null) {
      setClientError(next === "" ? LINK_COPY.chooseClient : null);
    }
    // Re-applies the chosen Client's earlier mapping, or resets.
    if (draft !== null) {
      setMapping(getPrefill(draft, next));
      setIsMappingEdited(false);
    }
  }

  function handleMappingChange(
    optionId: string,
    status: ClientStatus | null,
  ): void {
    setMapping((previous) => ({ ...previous, [optionId]: status }));
    setIsMappingEdited(true);
  }

  function handleRetry(): void {
    if (boardNodeId === null || draftFetcher.state !== "idle") return;

    setIsRetrying(true);
    void load(getLinkDraftPath(boardNodeId));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending || draft === null || boardNodeId === null) return;

    // A new attempt: the last refusal no longer applies.
    setBanner(null);
    if (clientId === "") {
      setClientError(LINK_COPY.chooseClient);
      clientSelectRef.current?.focus();
      return;
    }

    const form = new FormData();
    form.set(INTENT_FIELD, LINK_INTENT);
    form.set(BOARD_FIELD, boardNodeId);
    form.set(CLIENT_FIELD, clientId);
    form.set(OPTIONS_FIELD, JSON.stringify(draft.options));
    for (const option of draft.options) {
      form.set(`${MAPPING_FIELD_PREFIX}${option.id}`, mapping[option.id] ?? "");
    }
    void linkFetcher.submit(form, { method: "post", action: LINK_ACTION });
  }

  return {
    boardNodeId,
    boardTitle:
      draft?.board.title ?? getOpenerBoardTitle(locationState) ?? poolTitle,
    draftStatus,
    draft,
    clientId,
    clientError,
    relinkClientName,
    mapping,
    banner,
    isDirty: clientId !== "" || isMappingEdited,
    isRetrying,
    isPending,
    isLinked,
    clientSelectRef,
    columnsRef,
    handleClientChange,
    handleMappingChange,
    handleRetry,
    handleSubmit,
  };
}

function getDraftStatus(outcome: LinkDraftOutcome | undefined): DraftStatus {
  if (outcome === undefined) return "loading";
  if (outcome.kind === "ready") return "ready";

  const isFailed =
    outcome.kind === "failed" || outcome.error === "github-failed";
  return isFailed ? "failed" : "unavailable";
}

// The Client's frozen mapping for these options, or every option Unmapped.
function getPrefill(draft: LinkDraft, clientId: string): Mapping {
  const frozen = draft.frozenMappings[clientId] ?? {};
  return Object.fromEntries(
    draft.options.map((option) => [option.id, frozen[option.id] ?? null]),
  );
}

// The board's title from Home's pool, once it has streamed in.
function usePoolTitle(
  poolBoards: Promise<UnassignedBoard[] | "github-off" | null>,
  boardNodeId: string | null,
): string | null {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void poolBoards.then((boards) => {
      if (!isCurrent || !Array.isArray(boards)) return;

      const board = boards.find((row) => row.nodeId === boardNodeId);
      setTitle(board?.title ?? null);
    });
    return () => {
      isCurrent = false;
    };
  }, [poolBoards, boardNodeId]);

  return title;
}
