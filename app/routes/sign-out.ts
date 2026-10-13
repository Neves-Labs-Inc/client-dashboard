import { redirect } from "react-router";
import { auth } from "@/lib/auth/auth.server";
import { getAppEnv } from "@/lib/env";
import { isSameOrigin } from "@/lib/same-origin";
import type { Route } from "./+types/sign-out";

const SEE_OTHER = 303;
const FORBIDDEN = 403;
const METHOD_NOT_ALLOWED = 405;

// POST only: a GET must never sign anyone out (a link or prefetch could).
export function loader(): Response {
  return new Response(null, {
    status: METHOD_NOT_ALLOWED,
    headers: { Allow: "POST" },
  });
}

// The headers clear the session cookie. A same-site page (a sibling
// subdomain) could otherwise post here; SameSite=Lax doesn't stop it.
export async function action({ request }: Route.ActionArgs): Promise<Response> {
  if (!isSameOrigin(request, getAppEnv().BETTER_AUTH_URL)) {
    console.warn("sign-out: refused a cross-origin POST");
    return new Response(null, { status: FORBIDDEN });
  }

  const headers = await auth.signOut(request);
  return redirect("/sign-in", { status: SEE_OTHER, headers });
}
