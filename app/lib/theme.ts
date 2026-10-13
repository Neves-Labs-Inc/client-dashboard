import type { ShouldRevalidateFunctionArgs } from "react-router";

// Shared by the server (cookie, action) and the client (optimistic toggle).
export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

// Anything unknown counts as System, so a tampered cookie can't break SSR.
export function parseTheme(value: unknown): Theme {
  const match = THEMES.find((theme) => theme === value);
  return match ?? DEFAULT_THEME;
}

// The value for <html data-theme>: System renders no attribute at all.
export function getHtmlTheme(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}

// Same-origin relative paths only; "//evil.com" and "/\evil.com" are
// protocol-relative / backslash tricks browsers treat as off-site.
export function getSafeRedirect(value: unknown): string {
  const isSafePath =
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f]/.test(value);
  return isSafePath ? value : "/";
}

// The route that sets the cookie. The no-JS form posts here; the JS path goes
// through its clientAction.
export const THEME_ROUTE = "/theme";

// Marks the JS path: a fetcher must get data back, because it would follow a
// redirect as a navigation.
export const THEME_FETCHER_MODE = "fetcher";

// Every route with a loader returns this from its own shouldRevalidate.
// A failed theme change wrote nothing, and revalidating offline would throw
// to an ErrorBoundary instead of showing the toggle's inline error.
export function revalidateUnlessThemeFailed({
  formAction,
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  const isFailedThemeChange =
    formAction === THEME_ROUTE && actionResult?.ok === false;
  return isFailedThemeChange ? false : defaultShouldRevalidate;
}
