import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import InvoicesListView from "@/components/admin/invoices-list-view";
import {
  INVOICE_FILTER_PARAM,
  parseInvoiceListFilter,
} from "@/lib/admin-invoice-filter";
import { runCreateAction } from "@/lib/admin-invoice-create.server";
import {
  type CreateInvoiceOutcome,
  type CreateInvoiceResponse,
  type InvoiceClientOptions,
  isInvoiceDrawerToggle,
  runInvoiceClientAction,
} from "@/lib/admin-invoices";
import { auth } from "@/lib/auth/auth.server";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type {
  AdminInvoiceFilter,
  AdminInvoiceRow,
} from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import type { ProjectOption } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/invoices";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Invoices · Neves Labs Admin" }];
}

const NO_CLIENT_OPTIONS: InvoiceClientOptions = { active: [], archived: [] };
const CUSTOM_RANGE = "custom";

// Awaited, not streamed: the admin layout shows the skeleton during
// client-side navigation. A failed list resolves to null (the panel's error
// state); failed Clients are null (the controls say so, never "none"),
// failed years are null too (Any time and Custom range still work), and
// failed Project options leave the drawer without Projects, so the shell
// stays.
export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const searchParams = new URL(request.url).searchParams;
  const [loadedClients, loadedYears, projectOptionsByClient] =
    await Promise.all([
      loadClientOptions(),
      loadIssueYears(),
      loadProjectOptionsByClient(),
    ]);
  const knownClients = loadedClients ?? NO_CLIENT_OPTIONS;

  const { applied, form, rangeError } = parseInvoiceListFilter(searchParams, {
    clientIds: [...knownClients.active, ...knownClients.archived].map(
      (client) => client.id,
    ),
    years: loadedYears ?? [],
  });
  // A Client or year the failed options can't confirm would be dropped and
  // widen the list: show the list's error instead.
  const issuedParam = searchParams.get(INVOICE_FILTER_PARAM.issued) ?? "";
  const isFilterUnconfirmed =
    (loadedClients === null &&
      (searchParams.get(INVOICE_FILTER_PARAM.client) ?? "") !== "") ||
    (loadedYears === null &&
      issuedParam !== "" &&
      issuedParam !== CUSTOM_RANGE);
  const rows = isFilterUnconfirmed ? null : await loadInvoices(applied);

  return data(
    {
      clients: loadedClients,
      years: loadedYears,
      form,
      rangeError,
      rows,
      projectOptionsByClient,
      today: invoices.getToday(),
    },
    { headers },
  );
}

// The New invoice drawer posts here, with the chosen Client.
export function action({
  request,
}: Route.ActionArgs): Promise<CreateInvoiceResponse> {
  return runCreateAction(request);
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

// The Client filter's options; null when either list can't load.
async function loadClientOptions(): Promise<InvoiceClientOptions | null> {
  const [active, archived] = await Promise.all([
    auth.listClients().catch((error: unknown) => {
      console.error(
        `admin: couldn't load the Invoice filter's Clients (${describeError(error)})`,
      );
      return null;
    }),
    auth.listArchivedClients().catch((error: unknown) => {
      console.error(
        `admin: couldn't load the Invoice filter's archived Clients (${describeError(error)})`,
      );
      return null;
    }),
  ]);
  if (active === null || archived === null) return null;

  return {
    active: active.map(({ id, name }) => ({ id, name })),
    archived: archived.map(({ id, name }) => ({ id, name })),
  };
}

async function loadIssueYears(): Promise<number[] | null> {
  try {
    return await invoices.listIssueYears();
  } catch (error) {
    console.error(
      `admin: couldn't load the Invoice issue years (${describeError(error)})`,
    );
    return null;
  }
}

async function loadProjectOptionsByClient(): Promise<Record<
  string,
  ProjectOption[]
> | null> {
  try {
    return await requests.listProjectOptionsByClient();
  } catch (error) {
    console.error(
      `admin: couldn't load the Invoice project options (${describeError(error)})`,
    );
    return null;
  }
}

async function loadInvoices(
  filter: AdminInvoiceFilter,
): Promise<AdminInvoiceRow[] | null> {
  try {
    return await invoices.listAdminInvoices(filter);
  } catch (error) {
    console.error(
      `admin: couldn't load the Invoices (${describeError(error)})`,
      { filter },
    );
    return null;
  }
}

export default function Invoices({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return <InvoicesListView {...loaderData} />;
}
