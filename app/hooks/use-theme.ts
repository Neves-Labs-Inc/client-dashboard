import { useFetcher, useRouteLoaderData } from "react-router";
import { DEFAULT_THEME, parseTheme, type Theme } from "@/lib/theme";

// The root layout and every ThemeToggle share this key, so the page re-themes
// on click instead of after the round trip.
export const THEME_FETCHER_KEY = "theme";

type ThemeActionData = { ok: boolean };

export function useTheme() {
  const fetcher = useFetcher<ThemeActionData>({ key: THEME_FETCHER_KEY });
  const rootData = useRouteLoaderData<{ theme: Theme }>("root");

  const savedTheme = rootData?.theme ?? DEFAULT_THEME;
  const submittedTheme = fetcher.formData?.get("theme");
  const theme = submittedTheme ? parseTheme(submittedTheme) : savedTheme;

  return {
    fetcher,
    theme,
    isPending: fetcher.state !== "idle",
    hasFailed:
      fetcher.state === "idle" &&
      fetcher.data != null &&
      fetcher.data.ok !== true,
  };
}
