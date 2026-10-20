import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import AdminInvoiceDetailView from "@/components/admin/admin-invoice-detail-view";
import InvoiceNotFound from "@/components/admin/invoice-not-found";
import { useInvoicesBackPath } from "@/hooks/use-invoices-back-path";
import {
  runStatusClientAction,
  type StatusChangeOutcome,
  type StatusChangeResponse,
} from "@/lib/admin-invoice-status";
import { runStatusAction } from "@/lib/admin-invoice-status.server";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type { AdminInvoiceDetail } from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/invoice";

const NOT_FOUND = 404;

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const number = loaderData?.invoice?.number;
  const name = loaderData?.invoice?.client.name;
  const title = [number, name].filter(Boolean).join(" · ") || "Invoices";
  return [{ title: `${title} · Neves Labs Admin` }];
}

// Any Client's Invoice, from the global list. Awaited, not streamed: an
// unknown or non-UUID id must be a 404, and the admin layout shows the
// skeleton meanwhile. A failed load resolves to null (the page's error
// state).
export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const invoice = await loadInvoice(params.invoiceId);
  if (invoice === "not-found") {
    throw data(null, { status: NOT_FOUND, headers });
  }

  // Today bounds and defaults the Mark paid confirm's date.
  return data({ invoice, today: invoices.getToday() }, { headers });
}

async function loadInvoice(
  invoiceId: string,
): Promise<AdminInvoiceDetail | "not-found" | null> {
  try {
    // Null for an unknown or non-UUID id.
    return (await invoices.getAdminInvoiceById(invoiceId)) ?? "not-found";
  } catch (error) {
    console.error(
      `admin: couldn't load the Invoice (${describeError(error)})`,
      { invoiceId },
    );
    return null;
  }
}

// Mark paid, Revert to Open and Void post here, on the Invoice's own
// Client (looked up on the server; a posted clientId is ignored).
export function action({
  request,
  params,
}: Route.ActionArgs): Promise<StatusChangeResponse> {
  return runStatusAction(request, params.invoiceId);
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

export default function GlobalInvoice({
  loaderData,
  params,
}: Route.ComponentProps): React.ReactNode {
  const backTo = useInvoicesBackPath();

  // Keyed, so another Invoice starts with fresh focus state.
  return (
    <AdminInvoiceDetailView
      key={params.invoiceId}
      route="global"
      invoice={loaderData.invoice}
      today={loaderData.today}
      backTo={backTo}
    />
  );
}

// A 404 (an unknown or non-UUID id) in the main column; anything else goes
// on to the root boundary.
export function ErrorBoundary({
  error,
}: Route.ErrorBoundaryProps): React.ReactNode {
  if (!isRouteErrorResponse(error) || error.status !== NOT_FOUND) throw error;

  return <InvoiceNotFound route="global" />;
}
