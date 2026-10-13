import type { Access } from "@/lib/auth/auth";

export type AccessKind = Access["kind"];

// Where each access belongs when it lands on a page it isn't allowed on.
const ACCESS_HOME: Record<AccessKind, string> = {
  anonymous: "/sign-in",
  "admin-needs-passkey": "/passkey",
  admin: "/admin",
  client: "/team",
  // The / route joins an invitee to their newest live Invitation.
  invitee: "/",
  "no-access": "/no-access",
};

// Where an access belongs: the / route sends everyone here.
export function getAccessHome(kind: AccessKind): string {
  return ACCESS_HOME[kind];
}

// The path to redirect to, or null when the page allows this access.
export function getAccessRedirect(
  kind: AccessKind,
  allowed: readonly AccessKind[],
): string | null {
  return allowed.includes(kind) ? null : getAccessHome(kind);
}
