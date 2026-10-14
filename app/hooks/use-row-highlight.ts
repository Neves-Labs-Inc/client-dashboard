import { useCallback, useEffect, useRef, useState } from "react";

type RowHighlight = {
  highlightedId: string | null;
  highlight: (id: string) => void;
};

// The row highlight fade. Cleared for two frames first, so highlighting the
// same row again replays it.
export function useRowHighlight(initialId: string | null): RowHighlight {
  const [highlightedId, setHighlightedId] = useState(initialId);
  const frameRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Stable: row hooks list it in their effects' deps.
  const highlight = useCallback((id: string): void => {
    setHighlightedId(null);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => setHighlightedId(id));
    });
  }, []);

  return { highlightedId, highlight };
}
