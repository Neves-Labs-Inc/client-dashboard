import {
  data,
  redirect,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import ProfileView from "@/components/client/profile-view";
import type { ClientAccess } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import {
  requireClientMutation,
  requireClientUser,
} from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  LEFT_PATH,
  PROFILE_INTENT_FIELD,
  PROFILE_NAME_FIELD,
  type ProfileOutcome,
} from "@/lib/profile";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/profile";

const SEE_OTHER = 303;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

type OutcomeResponse = ReturnType<typeof data<ProfileOutcome>>;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.profile.clientName;
  const title = clientName ? `Profile · ${clientName}` : "Profile";
  return [{ title: `${title} · Neves Labs` }];
}

// Scoped by the session's Client User, never by the URL.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const profile = await auth.getProfile(access);
  return data({ profile }, { headers });
}

// Rename and Leave post here. The guard comes first, before the body is
// read: server-side auth calls skip Better Auth's origin check, so it is the
// only CSRF protection. A successful Leave ended every session of the user.
export async function action({
  request,
}: Route.ActionArgs): Promise<OutcomeResponse | Response> {
  const { access, headers } = await requireClientMutation(request);

  const form = await request.formData().catch(() => null);
  const intent = readField(form, PROFILE_INTENT_FIELD);
  try {
    if (intent === "rename") {
      return await rename(access, readField(form, PROFILE_NAME_FIELD), headers);
    }
    if (intent === "leave") return await leave(access, headers);

    console.warn("client: refused an unknown Profile action");
    return data<ProfileOutcome>(
      { kind: "failed" },
      { status: BAD_REQUEST, headers },
    );
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(`client: a Profile action failed (${describeError(error)})`, {
      intent,
      clientId: access.clientId,
    });
    return data<ProfileOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}

// A network failure (or a crash) becomes the outcome the UI shows instead
// of the route's error page; the guard's redirects, and the redirect after
// leaving, still go through. Anything but a success carries a 4xx/5xx
// status, so no loader revalidates: offline, a revalidation would throw the
// page to the root error boundary.
export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<ProfileOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "refused") {
      const status = outcome.error === "last-owner" ? CONFLICT : UNPROCESSABLE;
      return data(outcome, { status });
    }
    if (outcome.kind === "failed") {
      return data(outcome, { status: SERVER_ERROR });
    }

    return outcome;
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("client: the Profile request failed", error);
    return data<ProfileOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

async function rename(
  access: ClientAccess,
  name: string,
  headers: Headers,
): Promise<OutcomeResponse> {
  const result = await auth.updateDisplayName(access, name);
  const outcome: ProfileOutcome =
    result.error === null
      ? { kind: "renamed" }
      : { kind: "refused", error: result.error };
  return data(outcome, { status: result.status, headers });
}

async function leave(
  access: ClientAccess,
  headers: Headers,
): Promise<OutcomeResponse | Response> {
  const result = await auth.leaveClient(access);
  if (result.error === null) {
    return redirect(LEFT_PATH, { status: SEE_OTHER, headers });
  }

  return data<ProfileOutcome>(
    { kind: "refused", error: result.error },
    { status: result.status, headers },
  );
}

function readField(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return <ClientRouteError title="Profile" />;
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function ProfilePage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <ProfileView profile={loaderData.profile} />;
}
