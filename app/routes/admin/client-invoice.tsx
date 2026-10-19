import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import AdminInvoiceDetailView from "@/components/admin/admin-invoice-detail-view";
import InvoiceNotFound from "@/components/admin/invoice-not-found";
import { requireAdmin } from "@/lib/auth/require-access.server";
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

  return data({ client, invoice }, { headers });
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
