import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import AdminInvoiceDetailView from "@/components/admin/admin-invoice-detail-view";
import InvoiceNotFound from "@/components/admin/invoice-not-found";
import {
  getStatusChangeStatus,
  readStatusChange,
  runStatusClientAction,
  type StatusChangeOutcome,
  type StatusChangeResponse,
  type StatusIntent,
  type StatusRefusal,
  UNKNOWN_INTENT_STATUS,
} from "@/lib/admin-invoice-status";
import {
  requireAdmin,
  requireAdminMutation,
} from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type { InvoiceDetail } from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { loadClientWorkspace } from "@/lib/request-triage.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client-invoice";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const name = loaderData?.client?.name;
  const number = loaderData?.invoice?.number;
  const title = [number, name].filter(Boolean).join(" · ") || "Invoices";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// One Invoice in place of the Client's Invoices tab. Awaited, not streamed:
// an unknown Client, or an Invoice that isn't this Client's, must be a 404.
// A failed load resolves to null (the page's error state).
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const [client, invoice] = await Promise.all([
    loadClientWorkspace(params.clientId),
    loadInvoice(params.clientId, params.invoiceId),
  ]);
  if (client === "not-found" || invoice === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  // Today bounds and defaults the Mark paid confirm's date.
  return data({ client, invoice, today: invoices.getToday() }, { headers });
}

async function loadInvoice(
  clientId: string,
  invoiceId: string,
): Promise<InvoiceDetail | "not-found" | null> {
  try {
    // Null unless the Invoice is this Client's (or the id is no UUID).
    return (await invoices.getAdminInvoice(clientId, invoiceId)) ?? "not-found";
  } catch (error) {
    console.error(
      `admin: couldn't load the Invoice (${describeError(error)})`,
      { clientId, invoiceId },
    );
    return null;
  }
}

// Mark paid, Revert to Open and Void post here. The guard comes first,
// before the body is read: it is the CSRF protection. The module refuses
// another Client's Invoice, an archived Client's and a stale status, and
// validates the paid date again. An Invoice it can't find is a 404, the
// route's not-found page.
export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<StatusChangeResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const change = readStatusChange(form);
  const { clientId, invoiceId } = params;
  if (change === null) {
    console.warn("admin: refused an unknown Invoice action", {
      clientId,
      invoiceId,
    });
    return data<StatusChangeOutcome>(
      { kind: "failed" },
      { status: UNKNOWN_INTENT_STATUS, headers },
    );
  }

  let outcome: StatusChangeOutcome;
  try {
    outcome = await changeStatus(change, clientId, invoiceId);
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(
      `admin: changing an Invoice's status failed (${describeError(error)})`,
      { clientId, invoiceId, intent: change.intent },
    );
    outcome = { kind: "failed" };
  }
  if (outcome.kind === "refused" && outcome.error === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(outcome, { status: getStatusChangeStatus(outcome), headers });
}

async function changeStatus(
  change: { intent: StatusIntent; paidDate: string },
  clientId: string,
  invoiceId: string,
): Promise<StatusChangeOutcome> {
  const { intent } = change;
  if (intent === "paid") {
    return markPaid(clientId, invoiceId, change.paidDate);
  }

  const result =
    intent === "revert"
      ? await invoices.revertPaid(clientId, invoiceId)
      : await invoices.voidInvoice(clientId, invoiceId);
  return toOutcome(intent, result.error);
}

async function markPaid(
  clientId: string,
  invoiceId: string,
  paidDate: string,
): Promise<StatusChangeOutcome> {
  const result = await invoices.markPaid(clientId, invoiceId, paidDate);
  return result.error === "invalid"
    ? { kind: "invalid", fieldErrors: result.fieldErrors }
    : toOutcome("paid", result.error);
}

function toOutcome(
  intent: StatusIntent,
  error: StatusRefusal | null,
): StatusChangeOutcome {
  return error === null
    ? { kind: "changed", intent }
    : { kind: "refused", intent, error };
}

export function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<
  StatusChangeOutcome | StatusChangeResponse
> {
  return runStatusClientAction(serverAction);
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function ClientInvoice({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  // Keyed, so another Invoice starts with fresh focus state.
  return (
    <AdminInvoiceDetailView
      key={params.invoiceId}
      clientId={params.clientId}
      client={loaderData.client}
      invoice={loaderData.invoice}
      today={loaderData.today}
    />
  );
}

// A 404 (unknown Client, or an unknown, non-UUID or another Client's
// Invoice) in the main column; anything else goes on to the root boundary.
export function ErrorBoundary({
  error,
  params,
}: Route.ErrorBoundaryProps): React.ReactNode {
  if (!isRouteErrorResponse(error) || error.status !== NOT_FOUND) throw error;

  return <InvoiceNotFound clientId={params.clientId ?? ""} />;
}
