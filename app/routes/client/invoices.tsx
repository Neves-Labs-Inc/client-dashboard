import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientRouteError from "@/components/client/client-route-error";
import InvoicesPage from "@/components/invoices/invoices-page";
import { requireClientUser } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type { InvoiceRow } from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/invoices";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const clientName = loaderData?.clientName;
  const title = clientName ? `Invoices · ${clientName}` : "Invoices";
  return [{ title: `${title} · Neves Labs` }];
}

// Awaited, scoped by the session's Client, never by the URL. No action:
// Invoices are read-only here. A failed list is null (the panel's error
// state) and a failed summary drops only the open balance, so the page
// stays. The real errors are logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { access, headers } = await requireClientUser(request);
  const { clientId, clientName } = access;
  const [list, openBalanceCents] = await Promise.all([
    loadInvoices(clientId),
    loadOpenBalance(clientId),
  ]);
  return data({ clientName, invoices: list, openBalanceCents }, { headers });
}

async function loadInvoices(clientId: string): Promise<InvoiceRow[] | null> {
  let list: InvoiceRow[] | null = null;
  try {
    list = await invoices.listInvoices(clientId);
  } catch (error) {
    console.error(
      `client: couldn't load the Invoices (${describeError(error)})`,
      { clientId },
    );
  }
  return list;
}

async function loadOpenBalance(clientId: string): Promise<number | null> {
  let balance: number | null = null;
  try {
    balance = (await invoices.getInvoiceSummary(clientId)).openBalanceCents;
  } catch (error) {
    console.error(
      `client: couldn't load the Invoice summary (${describeError(error)})`,
      { clientId },
    );
  }
  return balance;
}

export const headers = getNoStoreHeaders;

export function ErrorBoundary(): React.ReactNode {
  return <ClientRouteError title="Invoices" />;
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function ClientInvoicesPage({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <InvoicesPage {...loaderData} />;
}
