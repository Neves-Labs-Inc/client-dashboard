import { useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { getInvoicesBackPath, INVOICES_PATH } from "@/lib/admin-invoices";

function subscribe(): () => void {
  return () => {};
}

// The global Invoice detail's back link: the list with the filters the row
// link carried. The server can't see the location state, so the first
// (hydrating) render uses the plain list and the next one the state's
// search; a client-side arrival reads the state at once.
export function useInvoicesBackPath(): string {
  const { state } = useLocation();
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return isHydrated ? getInvoicesBackPath(state) : INVOICES_PATH;
}
