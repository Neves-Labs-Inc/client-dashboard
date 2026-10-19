import {
  data,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import InvoiceDetailView from "@/components/invoices/invoice-detail-view";
import { useClientPaths } from "@/hooks/use-client-paths";
import { toClientInvoiceDetail } from "@/lib/invoices/client-invoice";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  getLayoutClientName,
  getPreviewTitle,
  PREVIEW_LAYOUT_ROUTE_ID,
} from "@/lib/preview";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/invoice";

const NOT_FOUND = 404;

export function meta({
  loaderData,
  error,
  matches,
}: Route.MetaArgs): Route.MetaDescriptors {
  let title = getPreviewTitle("Invoices");
  if (loaderData) {
    title = getPreviewTitle(loaderData.detail.number, loaderData.clientName);
  } else if (isRouteErrorResponse(error) && error.status === NOT_FOUND) {
    title = getPreviewTitle("Invoice not found", getLayoutClientName(matches));
  }
  return [{ title }];
}

// The client Invoice detail, for the URL's Client, on the client side of the
// module: a Void Invoice, another Client's, an unknown id and a non-UUID id
// all read as null and 404 alike.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const found = await invoices.getInvoice(client.clientId, params.invoiceId);
  if (found === null) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  const detail = toClientInvoiceDetail(found);
  return data({ clientName: client.clientName, detail }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export function ErrorBoundary(): React.ReactNode {
  const paths = useClientPaths();

  return (
    <ClientRouteError
      title="Invoices"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
      notFound={{
        title: "Invoice not found.",
        backHref: paths.invoices,
        backLabel: "Back to Invoices",
      }}
    />
  );
}

export default function PreviewInvoicePage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <InvoiceDetailView {...loaderData} />;
}
