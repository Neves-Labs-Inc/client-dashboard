import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientInvoicesView from "@/components/admin/client-invoices-view";
import { runCreateAction } from "@/lib/admin-invoice-create.server";
import {
  type CreateInvoiceOutcome,
  type CreateInvoiceResponse,
  isInvoiceDrawerToggle,
  runInvoiceClientAction,
} from "@/lib/admin-invoices";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { loadClientWorkspace } from "@/lib/request-triage.server";
import type { ProjectOption } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-invoices";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.client?.name;
  const title = name ? `${name} · Invoices` : "Invoices";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Awaited, not streamed: an unknown Client must be a 404, and the admin
// layout shows the skeleton meanwhile. A failed load resolves to null (the
// page's error state, or a drawer with no Projects), so the shell stays.
// Archived Clients included.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const [client, list, projectOptions] = await Promise.all([
    loadClientWorkspace(params.clientId),
    loadInvoices(params.clientId),
    loadProjectOptions(params.clientId),
  ]);
  if (client === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(
    { client, invoices: list, projectOptions, today: invoices.getToday() },
    { headers },
  );
}

async function loadInvoices(clientId: string): Promise<InvoiceRow[] | null> {
  try {
    return await invoices.listClientInvoices(clientId);
  } catch (error) {
    console.error(
      `admin: couldn't load the Client's Invoices (${describeError(error)})`,
      { clientId },
    );
    return null;
  }
}

async function loadProjectOptions(
  clientId: string,
): Promise<ProjectOption[] | null> {
  try {
    return await requests.listProjectOptions(clientId);
  } catch (error) {
    console.error(
      `admin: couldn't load the Invoice project options (${describeError(error)})`,
      { clientId },
    );
    return null;
  }
}

// The New invoice drawer posts here, with the URL's Client.
export function action({
  request,
  params,
}: Route.ActionArgs): Promise<CreateInvoiceResponse> {
  return runCreateAction(request, params.clientId);
}

export function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<
  CreateInvoiceOutcome | CreateInvoiceResponse
> {
  return runInvoiceClientAction(serverAction);
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isInvoiceDrawerToggle(args);
}

export default function ClientInvoices({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  // Keyed, so another Client's tab starts with fresh focus and form state.
  return (
    <ClientInvoicesView
      key={params.clientId}
      clientId={params.clientId}
      client={loaderData.client}
      invoices={loaderData.invoices}
      projectOptions={loaderData.projectOptions}
      today={loaderData.today}
    />
  );
}
