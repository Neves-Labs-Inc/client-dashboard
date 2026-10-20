import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import InvoicesPage from "@/components/invoices/invoices-page";
import { describeError } from "@/lib/describe-error";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { getPreviewTitle, PREVIEW_LAYOUT_ROUTE_ID } from "@/lib/preview";
import {
  refusePreviewAction,
  requirePreviewClient,
} from "@/lib/preview.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/invoices";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: getPreviewTitle("Invoices", loaderData?.clientName) }];
}

// The client Invoices list, for the URL's Client, on the client side of the
// module (app_tenant, no user), so Void stays hidden as it is from the
// Client. Awaited; a failed list is null (the panel's error state) and a
// failed summary drops only the open balance.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, headers } = await requirePreviewClient(
    request,
    params.clientId,
  );
  const { clientId, clientName } = client;
  const [list, openBalanceCents] = await Promise.all([
    invoices.listInvoices(clientId).catch((error): InvoiceRow[] | null => {
      console.error(
        `preview: couldn't load the Invoices (${describeError(error)})`,
        { clientId },
      );
      return null;
    }),
    invoices
      .getInvoiceSummary(clientId)
      .then((summary): number | null => summary.openBalanceCents)
      .catch((error) => {
        console.error(
          `preview: couldn't load the Invoice summary (${describeError(error)})`,
          { clientId },
        );
        return null;
      }),
  ]);
  return data({ clientName, invoices: list, openBalanceCents }, { headers });
}

// The preview never writes.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  return refusePreviewAction(request);
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return (
    <ClientRouteError
      title="Invoices"
      layoutRouteId={PREVIEW_LAYOUT_ROUTE_ID}
    />
  );
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function PreviewInvoicesPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <InvoicesPage {...loaderData} />;
}
