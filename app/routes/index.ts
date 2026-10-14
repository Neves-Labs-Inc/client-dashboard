import { redirect } from "react-router";
import { getAccessHome } from "@/lib/auth/access";
import { auth } from "@/lib/auth/auth.server";
import { getJoinedPath } from "@/lib/welcome";
import type { Route } from "./+types/index";

const NOT_INVITED_PATH = "/no-access?reason=not-invited";
const ARCHIVED_PATH = "/no-access?reason=archived";

// No page of its own: every access is sent where it belongs. An invitee
// (signed in from /sign-in) joins their newest live Invitation on the way.
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const { access, headers } = await auth.getAccess(request);
  const home =
    access.kind === "invitee"
      ? await joinNewestInvitation(request)
      : getAccessHome(access.kind);
  return redirect(home, { headers });
}

async function joinNewestInvitation(request: Request): Promise<string> {
  const joined = await auth.joinInvitation(request, null);
  let path = NOT_INVITED_PATH;
  if (joined.error === null) {
    path = getJoinedPath(joined);
  } else if (joined.error === "archived") {
    path = ARCHIVED_PATH;
  }
  return path;
}
