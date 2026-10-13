import { redirect } from "react-router";
import { getAccessHome } from "@/lib/auth/access";
import { auth } from "@/lib/auth/auth.server";
import type { Route } from "./+types/index";

// Until joining lands (ticket 03), an invitee can't get in yet.
const INVITEE_HOME = "/no-access?reason=not-invited";

// No page of its own: every access is sent where it belongs.
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const { access, headers } = await auth.getAccess(request);
  const home =
    access.kind === "invitee" ? INVITEE_HOME : getAccessHome(access.kind);
  return redirect(home, { headers });
}
