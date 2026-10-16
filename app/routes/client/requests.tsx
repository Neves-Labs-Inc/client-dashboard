import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import RequestsPage from "@/components/requests/requests-page";
import {
  requireClientMutation,
  requireClientUser,
} from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { isRequestDrawerToggle } from "@/lib/request-drawer";
import {
  getOutcomeStatus,
  readRequestDraft,
  runRequestClientAction,
  type RequestOutcome,
} from "@/lib/request-outcome";
import type { RequestRow } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import type { ProjectOption } from "@/lib/requests/requests";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/requests";

type OutcomeResponse = ReturnType<typeof data<RequestOutcome>>;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.clientName;
  const title = clientName ? `Requests · ${clientName}` : "Requests";
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client, never by the URL. A failed list
// is null (the panel's error state) instead of a throw, so the page and the
// drawer stay; failed options leave only "No specific project". The real
// errors are logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName } = access;
  const [list, projectOptions] = await Promise.all([
    loadRequests(clientId),
    loadProjectOptions(clientId),
  ]);
  return data({ clientName, requests: list, projectOptions }, { headers });
}

async function loadRequests(clientId: string): Promise<RequestRow[] | null> {
  let list: RequestRow[] | null = null;
  try {
    list = await requests.listRequests(clientId);
  } catch (error) {
    console.error(
      `client: couldn't load the Requests (${describeError(error)})`,
      { clientId },
    );
  }
  return list;
}

async function loadProjectOptions(clientId: string): Promise<ProjectOption[]> {
  let options: ProjectOption[] = [];
  try {
    options = await requests.listProjectOptions(clientId);
  } catch (error) {
    console.error(
      `client: couldn't load the Request project options (${describeError(error)})`,
      { clientId },
    );
  }
  return options;
}

// The new-Request drawer posts here, from this page or the Overview. The
// guard comes first, before the body is read: it is the CSRF protection.
export async function action({
  request,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { access, headers } = await requireClientMutation(request);
  const form = await request.formData().catch(() => null);
  const actor = { clientId: access.clientId, userId: access.userId };

  let outcome: RequestOutcome;
  try {
    const result = await requests.submitRequest(actor, readRequestDraft(form));
    if (result.error === null) {
      outcome = { kind: "submitted", requestId: result.value.id };
    } else if (result.error === "invalid") {
      outcome = { kind: "invalid", fieldErrors: result.fieldErrors };
    } else {
      outcome = { kind: "failed" };
    }
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(
      `client: submitting a Request failed (${describeError(error)})`,
      {
        clientId: access.clientId,
      },
    );
    outcome = { kind: "failed" };
  }
  return data(outcome, { status: getOutcomeStatus(outcome), headers });
}

export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<RequestOutcome | OutcomeResponse> {
  return runRequestClientAction(serverAction);
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return <ClientRouteError title="Requests" />;
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isRequestDrawerToggle(args);
}

export default function ClientRequestsPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <RequestsPage {...loaderData} />;
}
