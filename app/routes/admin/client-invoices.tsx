import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientInvoicesView from "@/components/admin/client-invoices-view";
import {
  type CreateInvoiceOutcome,
  type CreateInvoiceResponse,
  getCreateStatus,
  isInvoiceDrawerToggle,
  readInvoiceDraft,
  runInvoiceClientAction,
} from "@/lib/admin-invoices";
import {
  requireAdmin,
  requireAdminMutation,
} from "@/lib/auth/require-access.server";
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

// The New invoice drawer posts here. The guard comes first, before the body
// is read: it is the CSRF protection. The module refuses an archived or
// unknown Client, and validates the draft again.
export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<CreateInvoiceResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const { clientId } = params;

  let outcome: CreateInvoiceOutcome;
  try {
    const result = await invoices.createInvoice(
      clientId,
      readInvoiceDraft(form),
    );
    if (result.error === null) {
      outcome = {
        kind: "created",
        invoiceId: result.value.id,
        number: result.value.number,
      };
    } else if (result.error === "invalid") {
      outcome = { kind: "invalid", fieldErrors: result.fieldErrors };
    } else {
      outcome = { kind: "refused", error: result.error };
    }
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(
      `admin: creating an Invoice failed (${describeError(error)})`,
      {
        clientId,
      },
    );
    outcome = { kind: "failed" };
  }
  return data(outcome, { status: getCreateStatus(outcome), headers });
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
