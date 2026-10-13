import { data, Link, redirect } from "react-router";
import CenteredMessage from "@/components/centered-message";
import { buttonStyles } from "@/components/ui/button-styles";
import { getSafeRedirect, parseTheme, THEME_FETCHER_MODE } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { serializeTheme } from "@/lib/theme.server";
import type { Route } from "./+types/theme";

const SEE_OTHER = 303;

export async function action({
  request,
}: Route.ActionArgs): Promise<Response | ReturnType<typeof data>> {
  // Only a hand-crafted request has an unreadable body: send it home with
  // the cookie unchanged.
  const form = await request.formData().catch((error: unknown) => {
    console.warn("Theme POST with an unreadable body", error);
    return null;
  });
  if (!form) return redirect("/", SEE_OTHER);

  const theme = parseTheme(form.get("theme"));
  const headers = { "Set-Cookie": serializeTheme(theme) };
  const isFetcher = form.get("mode") === THEME_FETCHER_MODE;
  return isFetcher
    ? data({ ok: true as const, theme }, { headers })
    : redirect(getSafeRedirect(form.get("redirectTo")), {
        status: SEE_OTHER,
        headers,
      });
}

// A GET has nothing to show.
export function loader(): Response {
  return redirect("/");
}

// JS path only: a network or server failure becomes { ok: false }, so the
// toggle shows its inline error instead of the root ErrorBoundary.
export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<{ ok: boolean }> {
  try {
    const result = await serverAction();
    return result ?? { ok: false };
  } catch {
    return { ok: false };
  }
}

// A route module needs a component for RR to ship its clientAction.
export default function Theme(): null {
  return null;
}

// Only the no-JS document POST lands here (the JS path never throws).
export function ErrorBoundary(): React.ReactNode {
  return (
    <>
      <title>Couldn&apos;t change the theme · Neves Labs</title>
      <CenteredMessage
        title="Couldn't change the theme"
        detail="Your theme wasn't saved. Try again from the home page."
      >
        <Link
          to="/"
          // A link that looks like Button, so the sizes match it.
          className={cn(
            buttonStyles({ variant: "secondary" }),
            "mt-3 h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
          )}
        >
          Back to home
        </Link>
      </CenteredMessage>
    </>
  );
}
