import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import RequestDetailView from "@/components/requests/request-detail-view";
import type { ClientAccess } from "@/lib/auth/auth";
import {
  requireClientMutation,
  requireClientUser,
} from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { isRequestDrawerToggle, REQUESTS_PATH } from "@/lib/request-drawer";
import {
  getOutcomeStatus,
  readRequestDraft,
  REQUEST_INTENT_FIELD,
  runRequestClientAction,
  type RequestOutcome,
} from "@/lib/request-outcome";
import type {
  EditError,
  ProjectOption,
  WithdrawError,
} from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/request";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;

type OutcomeResponse = ReturnType<typeof data<RequestOutcome>>;

export function meta({
  loaderData,
  error,
}: Route.MetaArgs): Route.MetaDescriptors {
  let title = "Requests";
  if (loaderData) {
    title = loaderData.detail.title;
  } else if (isRouteErrorResponse(error) && error.status === NOT_FOUND) {
    title = "Request not found";
  }
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client: another Client's Request, an
// unknown id and a non-UUID id all read as null, so they 404 alike and the
// page never confirms that an id exists elsewhere. The project options are
// only for the edit drawer, so only read when the viewer may edit.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName, userId } = access;
  const detail = await requests.getRequest(
    { clientId, userId },
    params.requestId,
  );
  if (detail === null) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  const projectOptions: ProjectOption[] = detail.canChange
    ? await requests.listProjectOptions(clientId)
    : [];
  return data({ clientName, detail, projectOptions }, { headers });
}

// Edit and Withdraw post here; only the submitter of a New Request may. The
// guard comes first, before the body is read: it is the CSRF protection. A
// Request the viewer can't change (another user's, another Client's, an
// unknown id) is a 404, the route's not-found page.
export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { access, headers } = await requireClientMutation(request);
  const form = await request.formData().catch(() => null);
  const intent = form?.get(REQUEST_INTENT_FIELD);
  const { requestId } = params;

  let answer: ChangeAnswer = { outcome: { kind: "failed" }, isNotFound: false };
  let status: number | null = null;
  try {
    if (intent === "edit") {
      answer = await edit(access, requestId, form);
    } else if (intent === "withdraw") {
      answer = await withdraw(access, requestId);
    } else {
      console.warn("client: refused an unknown Request action", {
        clientId: access.clientId,
      });
      status = BAD_REQUEST;
    }
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(`client: a Request action failed (${describeError(error)})`, {
      clientId: access.clientId,
      requestId,
    });
  }
  if (answer.isNotFound) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  const { outcome } = answer;
  return data(outcome, {
    status: status ?? getOutcomeStatus(outcome),
    headers,
  });
}

type ChangeAnswer = { outcome: RequestOutcome; isNotFound: boolean };

async function edit(
  access: ClientAccess,
  requestId: string,
  form: FormData | null,
): Promise<ChangeAnswer> {
  const actor = { clientId: access.clientId, userId: access.userId };
  const result = await requests.editRequest(
    actor,
    requestId,
    readRequestDraft(form),
  );
  if (result.error === null) {
    return { outcome: { kind: "updated", requestId }, isNotFound: false };
  }
  if (result.error === "invalid") {
    return {
      outcome: { kind: "invalid", fieldErrors: result.fieldErrors },
      isNotFound: false,
    };
  }

  return toRefusalAnswer(result.error);
}

async function withdraw(
  access: ClientAccess,
  requestId: string,
): Promise<ChangeAnswer> {
  const actor = { clientId: access.clientId, userId: access.userId };
  const result = await requests.withdrawRequest(actor, requestId);
  return result.error === null
    ? { outcome: { kind: "withdrawn" }, isNotFound: false }
    : toRefusalAnswer(result.error);
}

// An archived Client's users are signed out by the session gate; should one
// still post, they get the generic failure.
function toRefusalAnswer(
  error: Exclude<EditError, "invalid"> | WithdrawError,
): ChangeAnswer {
  const outcome: RequestOutcome =
    error === "not-new" ? { kind: "not-new" } : { kind: "failed" };
  return { outcome, isNotFound: error === "not-found" };
}

export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<RequestOutcome | OutcomeResponse> {
  return runRequestClientAction(serverAction);
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isRequestDrawerToggle(args);
}

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Requests"
      notFound={{
        title: "Request not found.",
        backHref: REQUESTS_PATH,
        backLabel: "Back to Requests",
      }}
    />
  );
}

export default function RequestPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  // Keyed by id: a banner or confirm never carries over to another Request.
  return <RequestDetailView key={loaderData.detail.id} {...loaderData} />;
}
