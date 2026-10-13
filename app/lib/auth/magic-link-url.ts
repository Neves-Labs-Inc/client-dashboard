// The emailed magic link may only send the browser somewhere on the portal:
// the request's callbackURL is the browser's to choose, so anything but a
// plain same-origin path becomes "/" (an email must never carry an open
// redirect).

const HOME_PATH = "/";
// Phase 2's banner for an invalid or expired link.
const ERROR_PATH = "/sign-in";
// Controls and format characters (bidi, zero-width) could disguise a path.
const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

// `url` is the link Better Auth built; the result is the one to email.
export function withSafeRedirects(url: string, baseUrl: string): string {
  const link = new URL(url);
  const callbackPath = toSafePath(
    link.searchParams.get("callbackURL"),
    baseUrl,
  );
  link.searchParams.set("callbackURL", callbackPath);
  link.searchParams.set("errorCallbackURL", ERROR_PATH);
  // A new user lands where everyone does.
  link.searchParams.delete("newUserCallbackURL");
  return link.toString();
}

// A relative path on `baseUrl`'s origin, or "/". "//host" and "/\host" are
// relative-looking but leave the origin in browsers, so they're refused too.
// Resolving dot segments can make one ("/..//host" → "//host"), so the
// resolved path is what gets checked.
function toSafePath(value: string | null, baseUrl: string): string {
  if (value === null || !isSafePath(value)) return HOME_PATH;

  const origin = new URL(baseUrl).origin;
  const resolved = new URL(value, origin);
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return resolved.origin === origin && isSafePath(path) ? path : HOME_PATH;
}

// Better Auth decodes the value once before redirecting, so the decoded form
// must pass as well ("/%2F%2Fhost").
function isSafePath(path: string): boolean {
  const decoded = decodeOnce(path);
  return decoded !== null && isPlainPath(path) && isPlainPath(decoded);
}

function isPlainPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !HIDDEN_CHARACTERS.test(path)
  );
}

// Null when the escapes are malformed.
function decodeOnce(value: string): string | null {
  let decoded: string | null = null;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed: refused as unsafe.
  }
  return decoded;
}
