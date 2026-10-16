import type { ShouldRevalidateFunctionArgs } from "react-router";
import { withoutParam } from "@/lib/new-client";

// The Request drawer opens from the URL, as the create-Client drawer does, so
// any link can open it and it works before hydration: `?new=request` on the
// Requests page (and the Overview), `?edit=1` on a Request's detail.
export const NEW_REQUEST_PARAM = "new";
export const NEW_REQUEST_VALUE = "request";
export const NEW_REQUEST_SEARCH = `?${NEW_REQUEST_PARAM}=${NEW_REQUEST_VALUE}`;
export const EDIT_REQUEST_PARAM = "edit";
export const EDIT_REQUEST_VALUE = "1";
export const EDIT_REQUEST_SEARCH = `?${EDIT_REQUEST_PARAM}=${EDIT_REQUEST_VALUE}`;

export const REQUESTS_PATH = "/requests";
export const NEW_REQUEST_HREF = `${REQUESTS_PATH}${NEW_REQUEST_SEARCH}`;
// The new-Request drawer posts here, from whichever page opened it.
export const SUBMIT_REQUEST_ACTION = REQUESTS_PATH;

export function getRequestPath(requestId: string): string {
  return `${REQUESTS_PATH}/${requestId}`;
}

// True when a navigation only opens or closes a Request drawer: same path,
// and the search differs in its param alone. Loaders needn't run for it.
export function isRequestDrawerToggle({
  currentUrl,
  nextUrl,
}: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.search === nextUrl.search) return false;

  return [NEW_REQUEST_PARAM, EDIT_REQUEST_PARAM].some(
    (param) => withoutParam(currentUrl, param) === withoutParam(nextUrl, param),
  );
}
