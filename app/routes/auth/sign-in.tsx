import { KeyRound, Mail } from "lucide-react";
import {
  data,
  redirect,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import GoogleMark from "@/components/auth/google-mark";
import OrDivider from "@/components/auth/or-divider";
import Button from "@/components/ui/button";
import Field from "@/components/ui/field";
import FormError from "@/components/ui/form-error";
import Input from "@/components/ui/input";
import { useGoogleSignIn } from "@/hooks/use-google-sign-in";
import { usePasskeySignIn } from "@/hooks/use-passkey-sign-in";
import { type InitialBanner, useSignInForm } from "@/hooks/use-sign-in-form";
import { GOOGLE_ERROR_FLAG } from "@/lib/auth/auth-client";
import { auth } from "@/lib/auth/auth.server";
import { requireAccess } from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/sign-in";

const SEE_OTHER = 303;
// Marks a form the browser posted itself, before the page hydrated.
const UNSENT_PARAM = "unsent";
const GOOGLE_PROVIDER = "google";
// Where the opened magic link lands: / sends each access home.
const HOME_PATH = "/";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Sign in · Neves Labs" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAccess(request, ["anonymous"]);
  // Better Auth's errorCallbackURL redirect for an invalid, expired or reused
  // link adds ?error=; a failed Google round trip comes back flagged.
  const params = new URL(request.url).searchParams;
  let banner: InitialBanner = null;
  if (params.has("error") && params.has(GOOGLE_ERROR_FLAG)) {
    banner = "google-failed";
  } else if (params.has("error")) {
    banner = "bad-link";
  } else if (params.has(UNSENT_PARAM)) {
    banner = "failed";
  }
  const isGoogleEnabled = auth.listSocialProviders().includes(GOOGLE_PROVIDER);
  return data({ banner, isGoogleEnabled }, { headers });
}

// Only a submit before hydration lands here (the JS path never posts). It
// sends nothing, and the 303 keeps the email out of every URL and log.
export function action(): Response {
  return redirect(`/sign-in?${UNSENT_PARAM}`, SEE_OTHER);
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function SignIn({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { isGoogleEnabled } = loaderData;
  const form = useSignInForm(loaderData.banner);
  const google = useGoogleSignIn({
    callbackURL: HOME_PATH,
    onAttempt: () => {
      form.clearBanner();
      passkey.clearBanner();
    },
  });
  const passkey = usePasskeySignIn({
    isAutofillPaused: form.isPending || google.isPending,
    onAttempt: () => {
      form.clearBanner();
      google.clearBanner();
    },
  });
  // Each source clears the others when it starts, so this is the newest.
  const banner = google.banner ?? passkey.banner ?? form.banner;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    passkey.clearBanner();
    google.clearBanner();
    void form.handleSubmit(event);
  }

  return (
    <>
      <h1 className="text-lg/6 font-semibold text-fg">Sign in</h1>
      {banner && <FormError variant="banner">{banner}</FormError>}
      {isGoogleEnabled && (
        <>
          <Button
            ref={google.buttonRef}
            variant="primary"
            icon={GoogleMark}
            isPending={google.isPending}
            pendingLabel="Redirecting…"
            disabled={form.isPending || passkey.isPending}
            onClick={google.handleClick}
            className="w-full"
          >
            Continue with Google
          </Button>
          <OrDivider />
        </>
      )}
      <form
        method="post"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <Field label="Email" error={form.fieldError ?? undefined}>
          {(control) => (
            <Input
              {...control}
              ref={form.inputRef}
              type="email"
              name="email"
              autoComplete="username webauthn"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={passkey.isPending || google.isPending}
              value={form.email}
              onChange={form.handleChange}
              onBlur={form.handleBlur}
            />
          )}
        </Field>
        <Button
          ref={form.buttonRef}
          type="submit"
          icon={Mail}
          isPending={form.isPending}
          pendingLabel="Sending…"
          disabled={passkey.isPending || google.isPending}
          className="w-full"
        >
          Email me a sign-in link
        </Button>
      </form>
      <OrDivider />
      <Button
        ref={passkey.buttonRef}
        icon={KeyRound}
        isPending={passkey.isPending}
        pendingLabel="Signing in…"
        disabled={form.isPending || google.isPending}
        onClick={passkey.handleClick}
        className="w-full"
      >
        Sign in with a passkey
      </Button>
    </>
  );
}
