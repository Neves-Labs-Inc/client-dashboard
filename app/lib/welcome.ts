import type { JoinError, Joined } from "@/lib/auth/auth";
import type { Result } from "@/lib/result";

// The one-shot "Welcome to <Client>" toast after a join: the join's redirect
// carries this flag, and the client area drops it from the URL once shown,
// so a reload doesn't repeat it.
export const WELCOME_PARAM = "welcome";

const OVERVIEW_PATH = "/overview";
const CREATED = 201;

export function getWelcomeMessage(clientName: string): string {
  return `Welcome to ${clientName}`;
}

// Where a successful join lands: /overview, flagged for the toast only when this
// join made the person a member (a re-opened link just goes home).
export function getJoinedPath(joined: Result<Joined, JoinError>): string {
  return joined.status === CREATED
    ? `${OVERVIEW_PATH}?${WELCOME_PARAM}`
    : OVERVIEW_PATH;
}
