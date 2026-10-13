import { isIP } from "node:net";

// The header the auth module sets from the client IP it trusts. Better Auth
// reads only this one, so a client-sent X-Forwarded-For never reaches it.
export const CLIENT_IP_HEADER = "x-portal-client-ip";

// The client IP for rate limiting, or null when no header can be trusted.
// Only Vercel is trusted: it overwrites X-Forwarded-For with the client IP,
// and any proxy hop it adds goes on the right, so the last entry is the one
// it saw. Anywhere else (the self-hosted Docker image) the header is
// client-controlled, so it is ignored: Better Auth then rate-limits every
// client in one shared bucket per path, which only gets tighter, never
// bypassable.
export function getClientIp(
  headers: Headers,
  trustForwardedFor: boolean,
): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (!trustForwardedFor || forwardedFor === null) return null;

  const lastHop = forwardedFor.split(",").at(-1)?.trim() ?? "";
  return isIP(lastHop) === 0 ? null : lastHop;
}

// A copy of `headers` with CLIENT_IP_HEADER set to the trusted client IP, or
// removed when there is none.
export function withClientIp(
  headers: Headers,
  trustForwardedFor: boolean,
): Headers {
  const result = new Headers(headers);
  const ip = getClientIp(headers, trustForwardedFor);
  if (ip === null) {
    result.delete(CLIENT_IP_HEADER);
  } else {
    result.set(CLIENT_IP_HEADER, ip);
  }
  return result;
}
