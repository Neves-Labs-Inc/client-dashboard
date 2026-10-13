import { redirect } from "react-router";
import { getAccessHome } from "@/lib/auth/access";
import { auth } from "@/lib/auth/auth.server";
import type { Route } from "./+types/index";

// No page of its own: every access is sent where it belongs.
export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  const { access, headers } = await auth.getAccess(request);
  return redirect(getAccessHome(access.kind), { headers });
}
