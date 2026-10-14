import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import { CLIENTS_CRUMB } from "@/components/admin/client-workspace-header";
import TeamView from "@/components/admin/team-view";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import { auth } from "@/lib/auth/auth.server";
import { describeError } from "@/lib/describe-error";
import type { Team } from "@/lib/auth/auth";
import {
  requireAdmin,
  requireAdminMutation,
} from "@/lib/auth/require-access.server";
import { isInviteFlagRemoval } from "@/lib/new-client";
import { isArchiveIntent, type ArchiveOutcome } from "@/lib/team-archive";
import {
  INVITATION_ID_FIELD,
  INVITATION_INTENT_FIELD,
  INVITE_EMAIL_FIELD,
  type InvitationOutcome,
} from "@/lib/team-invitations";
import {
  isRosterIntent,
  MEMBER_ID_FIELD,
  type TeamOutcome,
} from "@/lib/team-roster";
import { runRosterIntent } from "@/lib/team-roster.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-team";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;
const ADMIN_ACTOR = { kind: "admin" } as const;

type OutcomeResponse = ReturnType<typeof data<TeamOutcome>>;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.team?.name;
  const title = name ? `${name} · Team` : "Team";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Awaited, not streamed: an unknown Client must be a 404, and the admin
// layout shows the skeleton during client-side navigation. A failed load
// resolves to null (the page's error state) instead of throwing, so the
// shell stays and the real error is logged here only.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const team = await loadTeam(params.clientId);
  if (team === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data({ team }, { headers });
}

// Invite, resend, revoke, the roster changes, archive and unarchive post
// here. The guard comes
// first, before the body is read: server-side auth calls skip Better Auth's
// origin check, so it is the only CSRF protection.
export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const intent = readField(form, INVITATION_INTENT_FIELD);
  try {
    const answer = await runIntent(intent, params.clientId, form);
    return data(answer.outcome, { status: answer.status, headers });
  } catch (error) {
    // The UI shows its notice or banner. Name and code only: a driver
    // error's message lists its bound parameters (the invitee's email).
    console.error(`admin: a Team action failed (${describeError(error)})`, {
      intent,
      clientId: params.clientId,
    });
    return data<TeamOutcome>(
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
}: Route.ClientActionArgs): Promise<TeamOutcome | OutcomeResponse> {
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

    console.error("admin: the Team request failed", error);
    return data<TeamOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

type IntentAnswer = { outcome: TeamOutcome; status: number };

async function runIntent(
  intent: string,
  clientId: string,
  form: FormData | null,
): Promise<IntentAnswer> {
  let answer: IntentAnswer = {
    outcome: { kind: "failed" },
    status: BAD_REQUEST,
  };
  if (isArchiveIntent(intent)) {
    const result =
      intent === "archive"
        ? await auth.archiveClient(clientId)
        : await auth.unarchiveClient(clientId);
    const outcome: ArchiveOutcome =
      result.error === null
        ? { kind: intent === "archive" ? "archived" : "unarchived" }
        : { kind: "refused", error: result.error };
    answer = { outcome, status: result.status };
  } else if (isRosterIntent(intent)) {
    const userId = readField(form, MEMBER_ID_FIELD);
    answer = await runRosterIntent(intent, ADMIN_ACTOR, clientId, userId);
  } else if (intent === "invite") {
    const result = await auth.inviteFirstOwner(
      clientId,
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
        ? await auth.resendInvitation(clientId, invitationId)
        : await auth.revokeInvitation(clientId, invitationId);
    const outcome: InvitationOutcome =
      result.error === null
        ? { kind: intent === "resend" ? "resent" : "revoked" }
        : { kind: "refused", error: result.error };
    answer = { outcome, status: result.status };
  } else {
    console.warn("admin: refused an unknown Team action");
  }
  return answer;
}

function readField(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isInviteFlagRemoval(args);
}

async function loadTeam(clientId: string): Promise<Team | "not-found" | null> {
  try {
    const team = await auth.getTeam(clientId);
    return team ?? "not-found";
  } catch (error) {
    console.error("admin: couldn't load the team", { clientId, error });
    return null;
  }
}

export default function ClientTeam({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const { team } = loaderData;
  if (team === null) return <TeamError />;

  // Keyed, so another Client's tab starts with fresh drawer and panel state.
  return <TeamView key={team.clientId} team={team} />;
}

function TeamError(): React.ReactNode {
  return (
    <>
      <PageHeader breadcrumb={[CLIENTS_CRUMB]} title="Team" />
      <Panel title="Team">
        <PanelError message="Couldn't load the team." />
      </Panel>
    </>
  );
}
