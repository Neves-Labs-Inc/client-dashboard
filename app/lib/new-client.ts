import type { ShouldRevalidateFunctionArgs } from "react-router";

// The create-Client drawer opens from `?new=client` on Admin Home, so any
// link can open it and it works before hydration.
export const NEW_CLIENT_PARAM = "new";
export const NEW_CLIENT_VALUE = "client";
export const NEW_CLIENT_HREF = `/admin?${NEW_CLIENT_PARAM}=${NEW_CLIENT_VALUE}`;
// The drawer posts to Admin Home's index action.
export const CREATE_CLIENT_ACTION = "/admin?index";
// Set on the redirect after a create: the Team tab opens "Invite first
// Owner", then drops it.
export const INVITE_PARAM = "invite";
export const TEAM_ROUTE_PATTERN = "/admin/clients/:clientId/team";

export type CreateClientOutcome =
  | { kind: "created"; clientId: string }
  // A name the server refused, as field copy.
  | { kind: "invalid"; fieldError: string }
  // Server or network failure: the drawer's banner.
  | { kind: "failed" };

// History state on the navigation that follows a create.
type CreatedClientState = { createdClientId: string };

export function getTeamPath(clientId: string): string {
  return `/admin/clients/${clientId}/team`;
}

export function getCreatedTeamHref(clientId: string): string {
  return `${getTeamPath(clientId)}?${INVITE_PARAM}=1`;
}

export function toCreatedClientState(clientId: string): CreatedClientState {
  return { createdClientId: clientId };
}

// The Client just created, if this location is the navigation after it.
export function getCreatedClientId(state: unknown): string | null {
  const isCreatedState =
    typeof state === "object" &&
    state !== null &&
    "createdClientId" in state &&
    typeof state.createdClientId === "string";
  return isCreatedState ? (state as CreatedClientState).createdClientId : null;
}

// True when a navigation only opens or closes the drawer: same path, and the
// search differs in NEW_CLIENT_PARAM alone. Loaders needn't run for it.
export function isNewClientDrawerToggle({
  currentUrl,
  nextUrl,
}: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.search === nextUrl.search) return false;

  return (
    withoutParam(currentUrl, NEW_CLIENT_PARAM) ===
    withoutParam(nextUrl, NEW_CLIENT_PARAM)
  );
}

// True when a navigation only drops INVITE_PARAM, once the Team tab has
// opened its invite drawer. Loaders needn't run for it.
export function isInviteFlagRemoval({
  currentUrl,
  nextUrl,
}: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (!currentUrl.searchParams.has(INVITE_PARAM)) return false;
  if (nextUrl.searchParams.has(INVITE_PARAM)) return false;

  return (
    withoutParam(currentUrl, INVITE_PARAM) ===
    withoutParam(nextUrl, INVITE_PARAM)
  );
}

// The URL's search without `param`, in a stable order.
export function withoutParam(url: URL, param: string): string {
  const params = new URLSearchParams(url.search);
  params.delete(param);
  params.sort();
  return params.toString();
}
