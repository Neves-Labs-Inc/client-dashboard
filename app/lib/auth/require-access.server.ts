import { data, redirect } from "react-router";
import {
  getAccessHome,
  getAccessRedirect,
  type AccessKind,
} from "@/lib/auth/access";
import type { AccessResult } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import { getAppEnv } from "@/lib/env";
import { isSameOrigin } from "@/lib/same-origin";

const FORBIDDEN = 403;

// For loaders: the request's access when the page allows it, otherwise a
// thrown redirect to where that access belongs. Either way the session's
// Set-Cookie headers travel along; on success the loader returns them (React
// Router merges loader Set-Cookie headers into the document response).
export async function requireAccess(
  request: Request,
  allowed: readonly AccessKind[],
): Promise<AccessResult> {
  const result = await auth.getAccess(request);
  const target = getAccessRedirect(result.access.kind, allowed);
  if (target !== null) throw redirect(target, { headers: result.headers });

  return result;
}

export type AdminAccess = { email: string; headers: Headers };

// The guard for every loader and action under /admin: the Admin's email, or
// a thrown redirect to /passkey or /sign-in. A parent route's loader doesn't
// run before a child's action, so each action calls this too. Callers put
// `headers` on their response, as with requireAccess.
export async function requireAdmin(request: Request): Promise<AdminAccess> {
  const { access, headers } = await auth.getAccess(request);
  if (access.kind !== "admin") {
    throw redirect(getAccessHome(access.kind), { headers });
  }

  return { email: access.email, headers };
}

// The guard for every /admin action that changes data: requireAdmin, then a
// same-origin check that throws a 403. A sibling subdomain is same-site, so
// SameSite=Lax still sends the session cookie with its POST.
export async function requireAdminMutation(
  request: Request,
): Promise<AdminAccess> {
  const access = await requireAdmin(request);
  if (!isSameOrigin(request, getAppEnv().BETTER_AUTH_URL)) {
    console.warn("admin: refused a cross-origin mutation", {
      path: new URL(request.url).pathname,
    });
    throw data(null, { status: FORBIDDEN, headers: access.headers });
  }

  return access;
}
