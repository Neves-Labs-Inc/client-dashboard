import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "@/lib/toast";
import { getWelcomeMessage, WELCOME_PARAM } from "@/lib/welcome";

// Arriving from a join (WELCOME_PARAM): the "Welcome to <Client>" toast,
// then the flag leaves the URL, so a reload or Back doesn't show it again.
export function useWelcomeToast(clientName: string): void {
  const location = useLocation();
  const navigate = useNavigate();
  // Dev's StrictMode runs the effect twice before the URL has changed.
  const hasShownRef = useRef(false);
  const hasWelcomeFlag = new URLSearchParams(location.search).has(
    WELCOME_PARAM,
  );

  useEffect(() => {
    if (!hasWelcomeFlag) {
      hasShownRef.current = false;
      return;
    }
    if (hasShownRef.current) return;

    hasShownRef.current = true;
    toast(getWelcomeMessage(clientName));
    const params = new URLSearchParams(location.search);
    params.delete(WELCOME_PARAM);
    const search = params.toString();
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "" },
      { replace: true, preventScrollReset: true },
    );
    // Only the flag's arrival matters, not the values read alongside it.
  }, [hasWelcomeFlag]);
}
