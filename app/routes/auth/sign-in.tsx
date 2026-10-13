import { KeyRound, Mail } from "lucide-react";
import {
  data,
  redirect,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import Button from "@/components/ui/button";
import Field from "@/components/ui/field";
import FormError from "@/components/ui/form-error";
import Input from "@/components/ui/input";
import { usePasskeySignIn } from "@/hooks/use-passkey-sign-in";
import { type InitialBanner, useSignInForm } from "@/hooks/use-sign-in-form";
import { requireAccess } from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/sign-in";

const SEE_OTHER = 303;
// Marks a form the browser posted itself, before the page hydrated.
const UNSENT_PARAM = "unsent";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Sign in · Neves Labs" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAccess(request, ["anonymous"]);
  // Better Auth's errorCallbackURL redirect for an invalid, expired or reused
  // link adds ?error=.
  const params = new URL(request.url).searchParams;
  let banner: InitialBanner = null;
  if (params.has("error")) {
    banner = "bad-link";
  } else if (params.has(UNSENT_PARAM)) {
    banner = "failed";
  }
  return data({ banner }, { headers });
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
  const form = useSignInForm(loaderData.banner);
  const passkey = usePasskeySignIn({
    isAutofillPaused: form.isPending,
    onAttempt: form.clearBanner,
  });
  // Each source clears the other when it starts, so this is the newest.
  const banner = passkey.banner ?? form.banner;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    passkey.clearBanner();
    void form.handleSubmit(event);
  }

  return (
    <>
      <h1 className="text-lg/6 font-semibold text-fg">Sign in</h1>
      {banner && <FormError variant="banner">{banner}</FormError>}
      <Button
        ref={passkey.buttonRef}
        variant="primary"
        icon={KeyRound}
        isPending={passkey.isPending}
        pendingLabel="Signing in…"
        disabled={form.isPending}
        onClick={passkey.handleClick}
        className="w-full"
      >
        Sign in with a passkey
      </Button>
      <OrDivider />
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
              disabled={passkey.isPending}
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
          disabled={passkey.isPending}
          className="w-full"
        >
          Email me a sign-in link
        </Button>
      </form>
    </>
  );
}

// Decorative: both buttons' labels already say what they do.
function OrDivider(): React.ReactNode {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs/4 font-medium tracking-[0.06em] text-fg-2 uppercase">
        or
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
