import { KeyRound, LogOut } from "lucide-react";
import {
  data,
  Form,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import Button from "@/components/ui/button";
import FormError from "@/components/ui/form-error";
import StatusIcon from "@/components/ui/status-icon";
import { usePasskeyRegistration } from "@/hooks/use-passkey-registration";
import { requireAccess } from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/passkey";

const SIGN_OUT_PATH = "/sign-out";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Register a passkey · Neves Labs" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAccess(request, ["admin-needs-passkey"]);
  return data(null, { headers });
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function Passkey(): React.ReactNode {
  const navigation = useNavigation();
  const isSigningOut = navigation.formAction === SIGN_OUT_PATH;
  const registration = usePasskeyRegistration();

  return (
    <>
      <h1 className="text-lg/6 font-semibold text-fg">Register a passkey</h1>
      <p className="text-sm/5 text-fg">
        The Admin area opens only with a passkey. Register one on this device to
        continue.
      </p>
      {registration.isRegistered && (
        <p
          role="status"
          className="flex animate-in items-center gap-1.5 text-[13px]/5 text-fg duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0"
        >
          <StatusIcon status="ok" size={16} />
          Passkey registered.
        </p>
      )}
      {registration.error && (
        <FormError variant="banner">{registration.error}</FormError>
      )}
      {/* One button whose action moves on once the passkey exists, so
          the screen never offers a second registration. */}
      <Button
        ref={registration.buttonRef}
        variant="primary"
        icon={KeyRound}
        isPending={registration.isPending}
        pendingLabel={
          registration.isRegistered ? "Signing in…" : "Registering…"
        }
        disabled={isSigningOut}
        onClick={registration.handlePrimary}
        className="w-full"
      >
        {registration.isRegistered
          ? "Sign in with passkey"
          : "Register passkey"}
      </Button>
      {/* A plain POST, so signing out works without JS too. */}
      <Form method="post" action={SIGN_OUT_PATH}>
        <Button
          type="submit"
          icon={LogOut}
          isPending={isSigningOut}
          pendingLabel="Signing out…"
          disabled={registration.isPending}
          className="w-full"
        >
          Sign out
        </Button>
      </Form>
    </>
  );
}
