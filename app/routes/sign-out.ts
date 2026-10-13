import { redirect } from "react-router";
import { auth } from "@/lib/auth/auth.server";
import { getAppEnv } from "@/lib/env";
import { isSameOrigin } from "@/lib/same-origin";
import type { Route } from "./+types/sign-out";

const SEE_OTHER = 303;
const FORBIDDEN = 403;
const METHOD_NOT_ALLOWED = 405;
const SIGN_IN_PATH = "/sign-in";
// The form field naming where to go once signed out (the Invitation page's
// mismatch state returns to itself).
const RETURN_FIELD = "returnTo";
// The only page that asks to come back: an Invitation's own.
const RETURN_PATTERN =
  /^\/invitations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const returnTo = (await request.formData()).get(RETURN_FIELD);
  const headers = await auth.signOut(request);
  return redirect(getReturnPath(returnTo), { status: SEE_OTHER, headers });
}

// An Invitation page only; anything else is /sign-in.
function getReturnPath(value: FormDataEntryValue | null): string {
  return typeof value === "string" && RETURN_PATTERN.test(value)
    ? value
    : SIGN_IN_PATH;
}
