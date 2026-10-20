import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import InvoiceDetailView from "@/components/invoices/invoice-detail-view";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { CLIENT_PATHS } from "@/lib/client-paths";
import { toClientInvoiceDetail } from "@/lib/invoices/client-invoice";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/invoice";

const NOT_FOUND = 404;

export function meta({
  loaderData,
  error,
}: Route.MetaArgs): Route.MetaDescriptors {
  let title = "Invoices";
  if (loaderData) {
    title = loaderData.detail.number;
  } else if (isRouteErrorResponse(error) && error.status === NOT_FOUND) {
    title = "Invoice not found";
  }
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client, never by the URL. A Void Invoice,
// another Client's, an unknown id and a non-UUID id all read as null, so
// they 404 alike and the page never confirms that an id exists elsewhere.
// No action: Invoices are read-only here.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName } = access;
  const found = await invoices.getInvoice(clientId, params.invoiceId);
  if (found === null) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  const detail = toClientInvoiceDetail(found);
  return data({ clientName, detail }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Invoices"
      notFound={{
        title: "Invoice not found.",
        backHref: CLIENT_PATHS.invoices,
        backLabel: "Back to Invoices",
      }}
    />
  );
}

export default function InvoicePage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <InvoiceDetailView {...loaderData} />;
}
