import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientTeamView, {
  type ClientTeam,
} from "@/components/team/client-team-view";
import type { ClientAccess } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import {
  requireClientMutation,
  requireClientUser,
} from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  INVITATION_ID_FIELD,
  INVITATION_INTENT_FIELD,
  INVITE_EMAIL_FIELD,
  type InvitationOutcome,
} from "@/lib/team-invitations";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/team";

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

type OutcomeResponse = ReturnType<typeof data<InvitationOutcome>>;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.clientName;
  const title = clientName ? `Team · ${clientName}` : "Team";
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client, never by the URL. A failed load
// resolves to null (the page's error state) instead of throwing, so the
// shell stays and the real error is logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const team = await loadTeam(access);
  const { clientName, role } = access;
  return data({ clientName, role, team }, { headers });
}

// An Owner's invite, resend and revoke post here. The guard comes first,
// before the body is read: server-side auth calls skip Better Auth's origin
// check, so it is the only CSRF protection. A Member's post is refused
// before anything runs (the auth module refuses it too).
export async function action({
  request,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { access, headers } = await requireClientMutation(request);
  if (access.role !== "owner") {
    console.warn("client: refused a Member's invitation action", {
      clientId: access.clientId,
    });
    return data<InvitationOutcome>(
      { kind: "refused", error: "forbidden" },
      { status: FORBIDDEN, headers },
    );
  }

  const form = await request.formData().catch(() => null);
  const intent = readField(form, INVITATION_INTENT_FIELD);
  try {
    const answer = await runIntent(intent, access, form);
    return data(answer.outcome, { status: answer.status, headers });
  } catch (error) {
    // The UI shows its notice or banner. Name and code only: a driver
    // error's message lists its bound parameters (the invitee's email).
    console.error(
      `client: an invitation action failed (${describeError(error)})`,
      { intent, clientId: access.clientId },
    );
    return data<InvitationOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}

// A network failure (or a crash) becomes the outcome the UI shows instead
// of the route's error page; the guard's redirects still go through.
// Anything but a success carries a 4xx/5xx status, so no loader
// revalidates: offline, a revalidation would throw the page to the root
// error boundary.
export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<InvitationOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "refused") {
      return data(outcome, { status: UNPROCESSABLE });
    }
    if (outcome.kind === "failed") {
      return data(outcome, { status: SERVER_ERROR });
    }

    return outcome;
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("client: the invitation request failed", error);
    return data<InvitationOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

type IntentAnswer = { outcome: InvitationOutcome; status: number };

async function runIntent(
  intent: string,
  access: ClientAccess,
  form: FormData | null,
): Promise<IntentAnswer> {
  let answer: IntentAnswer = {
    outcome: { kind: "failed" },
    status: BAD_REQUEST,
  };
  if (intent === "invite") {
    const result = await auth.inviteMember(
      access,
      readField(form, INVITE_EMAIL_FIELD),
    );
    const outcome: InvitationOutcome =
      result.error === null
        ? { kind: "sent", invitationId: result.value.id }
        : { kind: "refused", error: result.error };
    answer = { outcome, status: result.status };
  } else if (intent === "resend" || intent === "revoke") {
    const invitationId = readField(form, INVITATION_ID_FIELD);
    const result =
      intent === "resend"
        ? await auth.resendMemberInvitation(access, invitationId)
        : await auth.revokeMemberInvitation(access, invitationId);
    const outcome: InvitationOutcome =
      result.error === null
        ? { kind: intent === "resend" ? "resent" : "revoked" }
        : { kind: "refused", error: result.error };
    answer = { outcome, status: result.status };
  } else {
    console.warn("client: refused an unknown Team action");
  }
  return answer;
}

function readField(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

async function loadTeam(access: ClientAccess): Promise<ClientTeam | null> {
  const { clientId, role } = access;
  let clientTeam: ClientTeam | null = null;
  try {
    const team = await auth.getTeam(clientId);
    if (team === null) {
      console.error("client: the session's Client has no team", { clientId });
    } else {
      const { members } = team;
      // Members never receive the pending invitations, and Owners only the
      // Member ones: the Admin's Owner invitations are the Admin's to manage.
      const pendingInvitations = team.pendingInvitations.filter(
        (pending) => pending.role === "member",
      );
      clientTeam =
        role === "owner" ? { members, pendingInvitations } : { members };
    }
  } catch (error) {
    console.error("client: couldn't load the team", { clientId, error });
  }
  return clientTeam;
}

export default function ClientTeamPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <ClientTeamView {...loaderData} />;
}
