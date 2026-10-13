import { LogOut } from "lucide-react";
import {
  data,
  Form,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import BackToSignInLink from "@/components/auth/back-to-sign-in-link";
import Button from "@/components/ui/button";
import type { NoAccessReason } from "@/lib/auth/auth";
import { requireAccess } from "@/lib/auth/require-access.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/no-access";

const SIGN_OUT_PATH = "/sign-out";
const DEFAULT_REASON: NoAccessReason = "not-invited";

// Fixed copy per reason: the URL's value only picks one, never shows.
const REASON_COPY: Record<NoAccessReason, string> = {
  "not-invited":
    "This Google account isn't invited to the Neves Labs portal. Ask your team's Owner for an invitation, then sign in with the invited email.",
  archived: "This account no longer has access.",
};

export function meta(): Route.MetaDescriptors {
  return [{ title: "No access · Neves Labs" }];
}

// Anyone who can't get in lands here: a refused sign-in (no session), an
// invitee until joining lands, or a session that can't be let in. The
// Admin and Client Users are sent home.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireAccess(request, [
    "anonymous",
    "invitee",
    "no-access",
  ]);
  const reason =
    access.kind === "no-access"
      ? access.reason
      : parseReason(new URL(request.url).searchParams.get("reason"));
  return data({ reason, hasSession: access.kind !== "anonymous" }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

function parseReason(value: string | null): NoAccessReason {
  const reasons: NoAccessReason[] = ["archived", "not-invited"];
  return reasons.find((reason) => reason === value) ?? DEFAULT_REASON;
}

export default function NoAccess({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { reason, hasSession } = loaderData;
  const navigation = useNavigation();
  const isSigningOut = navigation.formAction === SIGN_OUT_PATH;

  return (
    <>
      <h1 className="text-lg/6 font-semibold text-fg">No access</h1>
      <p className="text-sm/5 text-fg">{REASON_COPY[reason]}</p>
      {hasSession ? (
        <Form method="post" action={SIGN_OUT_PATH} className="self-start">
          <Button
            type="submit"
            variant="secondary"
            icon={LogOut}
            isPending={isSigningOut}
            pendingLabel="Signing out…"
          >
            Sign out
          </Button>
        </Form>
      ) : (
        <BackToSignInLink />
      )}
    </>
  );
}
