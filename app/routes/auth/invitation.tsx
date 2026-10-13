import { LogOut, Mail } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  data,
  Form,
  redirect,
  useActionData,
  useNavigation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import BackToSignInLink from "@/components/auth/back-to-sign-in-link";
import GoogleMark from "@/components/auth/google-mark";
import OrDivider from "@/components/auth/or-divider";
import Button from "@/components/ui/button";
import FormError from "@/components/ui/form-error";
import { useGoogleSignIn } from "@/hooks/use-google-sign-in";
import {
  CHECK_EMAIL_PATH,
  MAGIC_LINK_BANNER_COPY,
} from "@/hooks/use-sign-in-form";
import type { Access, InvitationLinkError } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import { getAppEnv } from "@/lib/env";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { isSameOrigin } from "@/lib/same-origin";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import { getJoinedPath } from "@/lib/welcome";
import type { Route } from "./+types/invitation";

const SIGN_OUT_PATH = "/sign-out";
const ARCHIVED_PATH = "/no-access?reason=archived";
const GOOGLE_PROVIDER = "google";
const SEE_OTHER = 303;
const OK = 200;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

// What the page shows. The invited email and Client name travel only with a
// live Invitation; the not-valid state carries nothing about the id.
type InvitationPage =
  | {
      kind: "live";
      invitationId: string;
      email: string;
      clientName: string;
      isGoogleEnabled: boolean;
    }
  | {
      kind: "mismatch";
      invitationId: string;
      email: string;
      clientName: string;
    }
  | { kind: "ineligible"; clientName: string }
  | { kind: "not-valid" };

const NOT_VALID: InvitationPage = { kind: "not-valid" };

// Each state's HTTP status; every one still renders its page.
const PAGE_STATUS: Record<InvitationPage["kind"], number> = {
  live: OK,
  mismatch: FORBIDDEN,
  ineligible: FORBIDDEN,
  "not-valid": NOT_FOUND,
};

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const page = loaderData;
  const title =
    page && page.kind !== "not-valid"
      ? `Join ${page.clientName}`
      : "Invitation";
  return [{ title: `${title} · Neves Labs` }];
}

// Joining happens here, in a GET, on purpose: it's bound to the session's
// own email (a link holder can't join anyone else) and idempotent, so a
// prefetch or a reload only repeats the same outcome.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { access, headers } = await auth.getAccess(request);
  const { invitationId } = params;

  let page: InvitationPage;
  if (access.kind === "invitee" || access.kind === "client") {
    const joined = await auth.joinInvitation(request, invitationId);
    if (joined.error === null) {
      throw redirect(getJoinedPath(joined), { headers });
    }
    if (joined.error === "archived") throw redirect(ARCHIVED_PATH, { headers });

    page =
      joined.error === "not-found"
        ? NOT_VALID
        : await getRefusedPage(invitationId, joined.error);
  } else {
    page = await getPageFor(access, invitationId);
  }
  return data(page, { status: PAGE_STATUS[page.kind], headers });
}

export const headers = getNoStoreHeaders;

// A failed send changed nothing, and revalidating while offline would throw
// the page to the root error boundary instead of showing the banner.
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  const isFailedSend =
    args.formMethod === "POST" &&
    args.formAction?.split("?")[0] === args.currentUrl.pathname &&
    isSendFailure(args.actionResult);
  return revalidateUnlessThemeFailed(args) && !isFailedSend;
}

function isSendFailure(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof result.error === "string"
  );
}

// "Email me a sign-in link": the address is the Invitation's own, read on
// the server from the id, never from the form. A plain POST, so it works
// before hydration too.
export async function action({ request, params }: Route.ActionArgs) {
  if (!isSameOrigin(request, getAppEnv().BETTER_AUTH_URL)) {
    console.warn("invitation: refused a cross-origin POST");
    throw data(null, { status: FORBIDDEN });
  }

  const { access, headers } = await auth.getAccess(request);
  const { invitationId } = params;
  // A signed-in browser has nothing to request: the page joins or explains.
  if (access.kind !== "anonymous") {
    throw redirect(`/invitations/${invitationId}`, { headers });
  }

  const sent = await auth.requestInvitationLink(request, invitationId);
  if (sent.error === null) {
    throw redirect(CHECK_EMAIL_PATH, { status: SEE_OTHER, headers });
  }
  // It died since the page loaded: reload it, so it says "not valid" (a
  // failed action alone wouldn't revalidate the loader).
  if (sent.error === "not-found") {
    throw redirect(`/invitations/${invitationId}`, {
      status: SEE_OTHER,
      headers,
    });
  }

  return data({ error: sent.error }, { status: sent.status, headers });
}

// JS path only: a network failure of the send (or a crash) becomes the
// inline "Couldn't send the link." banner instead of the root error
// boundary. Redirects (check-email, the page reload) still go through.
export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  try {
    const sent = await serverAction();
    const status =
      sent.error === "rate-limited" ? TOO_MANY_REQUESTS : SERVER_ERROR;
    return data(sent, { status });
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("invitation: the sign-in link request failed", error);
    const failed: { error: InvitationLinkError } = { error: "failed" };
    return data(failed, { status: SERVICE_UNAVAILABLE });
  }
}

// A visitor sees a live Invitation; any other session that isn't joining
// (the Admin, needs-passkey, no-access) is told whose it is.
async function getPageFor(
  access: Access,
  invitationId: string,
): Promise<InvitationPage> {
  const live = await auth.getLiveInvitation(invitationId);
  let page = NOT_VALID;
  if (live !== null && access.kind === "anonymous") {
    const isGoogleEnabled = auth
      .listSocialProviders()
      .includes(GOOGLE_PROVIDER);
    page = { kind: "live", invitationId, ...live, isGoogleEnabled };
  } else if (live !== null) {
    page = { kind: "mismatch", invitationId, ...live };
  }
  return page;
}

// The join was refused, but the Invitation may still be live: say why. It
// may also have died since (revoked meanwhile): then it's simply not valid.
async function getRefusedPage(
  invitationId: string,
  error: "email-mismatch" | "ineligible",
): Promise<InvitationPage> {
  const live = await auth.getLiveInvitation(invitationId);
  let page = NOT_VALID;
  if (live !== null && error === "ineligible") {
    page = { kind: "ineligible", clientName: live.clientName };
  } else if (live !== null) {
    page = { kind: "mismatch", invitationId, ...live };
  }
  return page;
}

export default function Invitation({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const page = loaderData;
  let content: React.ReactNode;
  if (page.kind === "live") {
    content = <LiveInvitation {...page} />;
  } else if (page.kind === "mismatch") {
    content = (
      <>
        <PageTitle>Join {page.clientName}</PageTitle>
        <p className="text-sm/5 text-fg">
          This invitation is for{" "}
          <span className="font-medium wrap-anywhere">{page.email}</span>. Sign
          out, then sign in with that email.
        </p>
        <SignOutForm returnTo={`/invitations/${page.invitationId}`} />
      </>
    );
  } else if (page.kind === "ineligible") {
    content = (
      <>
        <PageTitle>Can&apos;t join {page.clientName}</PageTitle>
        <p className="text-sm/5 text-fg">
          This email already belongs to a user of another Client.
        </p>
        {/* No return: coming back here would offer the same dead end. */}
        <SignOutForm returnTo={null} />
      </>
    );
  } else {
    content = (
      <>
        <PageTitle>Invitation not valid</PageTitle>
        <p className="text-sm/5 text-fg">
          This invitation is no longer valid. Ask for a new one.
        </p>
        <BackToSignInLink />
      </>
    );
  }
  return content;
}

function PageTitle({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <h1 className="text-lg/6 font-semibold wrap-break-word text-fg">
      {children}
    </h1>
  );
}

type LiveInvitationProps = Extract<InvitationPage, { kind: "live" }>;

function LiveInvitation({
  invitationId,
  email,
  clientName,
  isGoogleEnabled,
}: LiveInvitationProps): React.ReactNode {
  const navigation = useNavigation();
  const actionData = useActionData<typeof clientAction>();
  const emailButtonRef = useRef<HTMLButtonElement>(null);
  // By path: a form with no action keeps the page's query string (a mail
  // client's tracking parameters, say) in formAction.
  const isSending =
    navigation.state === "submitting" &&
    navigation.formAction?.split("?")[0] === `/invitations/${invitationId}`;
  const google = useGoogleSignIn({
    callbackURL: `/invitations/${invitationId}`,
  });
  const sendError = getSendError(actionData?.error);
  // One banner at a time: a new attempt of either kind hides the last
  // send's failure, and a send clears Google's.
  const isAttempting = google.isPending || isSending;
  const banner = google.banner ?? (isAttempting ? null : sendError);

  // A failed send re-renders with the banner; focus goes back to the button
  // (the alert announces it).
  useEffect(() => {
    if (actionData?.error) emailButtonRef.current?.focus();
  }, [actionData]);

  function handleSubmit(): void {
    google.clearBanner();
  }

  return (
    <>
      <PageTitle>Join {clientName}</PageTitle>
      <p className="text-sm/5 text-fg">
        You&apos;re invited as{" "}
        <span className="font-medium wrap-anywhere">{email}</span>. Sign in with
        that email to join.
      </p>
      {banner && <FormError variant="banner">{banner}</FormError>}
      {isGoogleEnabled && (
        <>
          <Button
            ref={google.buttonRef}
            variant="primary"
            icon={GoogleMark}
            isPending={google.isPending}
            pendingLabel="Redirecting…"
            disabled={isSending}
            onClick={google.handleClick}
            className="w-full"
          >
            Continue with Google
          </Button>
          <OrDivider />
        </>
      )}
      <Form method="post" onSubmit={handleSubmit}>
        <Button
          ref={emailButtonRef}
          type="submit"
          variant={isGoogleEnabled ? "secondary" : "primary"}
          icon={Mail}
          isPending={isSending}
          pendingLabel="Sending…"
          disabled={google.isPending}
          className="w-full"
        >
          Email me a sign-in link
        </Button>
      </Form>
    </>
  );
}

function getSendError(error: InvitationLinkError | undefined): string | null {
  let copy: string | null = null;
  if (error === "rate-limited") {
    copy = MAGIC_LINK_BANNER_COPY["rate-limited"];
  } else if (error !== undefined) {
    copy = MAGIC_LINK_BANNER_COPY.failed;
  }
  return copy;
}

function SignOutForm({
  returnTo,
}: {
  returnTo: string | null;
}): React.ReactNode {
  const navigation = useNavigation();
  const isSigningOut = navigation.formAction === SIGN_OUT_PATH;

  return (
    <Form method="post" action={SIGN_OUT_PATH}>
      {returnTo !== null && (
        <input type="hidden" name="returnTo" value={returnTo} />
      )}
      <Button
        type="submit"
        variant="primary"
        icon={LogOut}
        isPending={isSigningOut}
        pendingLabel="Signing out…"
        className="w-full"
      >
        Sign out
      </Button>
    </Form>
  );
}
