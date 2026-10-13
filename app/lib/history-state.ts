// Drops React Router's location state (`usr`) from the current history
// entry through the History API, so a reload or Back/Forward doesn't replay
// what it marked. navigate() would rerun the loaders; the in-memory location
// (and anything it is animating) is unaffected.
export function clearHistoryState(): void {
  const current: unknown = window.history.state;
  const next =
    typeof current === "object" && current !== null
      ? { ...current, usr: null }
      : current;
  window.history.replaceState(next, "");
}
