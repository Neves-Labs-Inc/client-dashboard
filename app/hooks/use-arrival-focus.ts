import { useEffect, useState } from "react";
import { useLocation } from "react-router";

// Arriving from a list, the clicked link is gone: start at the title.
// Read once: later revalidations mustn't move focus again.
export function useArrivalFocus(
  titleRef: React.RefObject<HTMLHeadingElement | null>,
): void {
  const location = useLocation();
  const [isInAppArrival] = useState(() => location.key !== "default");

  useEffect(() => {
    if (isInAppArrival) titleRef.current?.focus();
  }, [isInAppArrival, titleRef]);
}
