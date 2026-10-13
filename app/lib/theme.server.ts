import { parseTheme, type Theme } from "@/lib/theme";

const COOKIE_NAME = "theme";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`);

// A plain cookie (not RR's createCookie, which base64-encodes JSON): the value
// is one of three words and holds nothing secret.
export function getThemeFromRequest(request: Request): Theme {
  const header = request.headers.get("Cookie") ?? "";
  return parseTheme(COOKIE_PATTERN.exec(header)?.[1]);
}

export function serializeTheme(theme: Theme): string {
  // HttpOnly: the client never reads it (the toggle is optimistic through the
  // fetcher). Secure outside dev, so plain HTTP can't inject it.
  const secure = import.meta.env.PROD ? "; Secure" : "";
  return `${COOKIE_NAME}=${theme}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax; HttpOnly${secure}`;
}
