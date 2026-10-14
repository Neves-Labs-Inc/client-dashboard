import { useRef } from "react";
import {
  data,
  useRouteLoaderData,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ArchivedClientsPanel from "@/components/admin/archived-clients-panel";
import ClientsPanel from "@/components/admin/clients-panel";
import CreateClientDrawer from "@/components/admin/create-client-drawer";
import NewClientLink from "@/components/admin/new-client-link";
import PageHeader from "@/components/ui/page-header";
import type { CreateClientError } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import { CLIENT_NAME_COPY, getClientNameError } from "@/lib/client-name";
import {
  isNewClientDrawerToggle,
  NEW_CLIENT_PARAM,
  NEW_CLIENT_VALUE,
  type CreateClientOutcome,
} from "@/lib/new-client";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  requireAdmin,
  requireAdminMutation,
} from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/index";
import type { loader as adminLayoutLoader } from "./layout";

const ADMIN_LAYOUT_ROUTE_ID = "routes/admin/layout";

const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

type OutcomeResponse = ReturnType<typeof data<CreateClientOutcome>>;

export function meta(): Route.MetaDescriptors {
  return [{ title: "Clients · Neves Labs Admin" }];
}

// The roster streams in un-awaited, so the page and its skeleton render
// first. The layout's loader guards the document too, but runs alongside this
// one, so this runs the guard itself.
export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  // Resolves to null on failure instead of rejecting: a rejection that
  // reaches the browser before <Await> renders is an unhandled rejection
  // there, and it would carry the driver's error (SQL text and parameters).
  // The real error is logged here only. Nothing here can reject, so nothing
  // is unhandled on the server either.
  const clients = auth.listClients().catch((error: unknown) => {
    console.error("admin: couldn't load Clients", error);
    return null;
  });
  return data({ clients }, { headers });
}

// The create-Client drawer posts here. A parent route's loader never runs
// before an action, so this runs the guard itself.
export async function action({
  request,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { headers } = await requireAdminMutation(request);
  const name = await readName(request);
  try {
    const result = await auth.createClient(name);
    const outcome: CreateClientOutcome =
      result.error === null
        ? { kind: "created", clientId: result.value.clientId }
        : { kind: "invalid", fieldError: getFieldError(result.error, name) };
    return data(outcome, { status: result.status, headers });
  } catch (error) {
    // The drawer shows its banner; the error itself stays on the server.
    console.error("admin: couldn't create a Client", error);
    return data<CreateClientOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}

// A network failure (or a crash) becomes the drawer's banner instead of the
// route's error page. Redirects (the guard's) still go through. Anything but
// a create carries a 4xx/5xx status, so no loader revalidates: offline, a
// revalidation would throw the whole page to the root error boundary.
export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<CreateClientOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "created") return outcome;

    const status = outcome.kind === "invalid" ? UNPROCESSABLE : SERVER_ERROR;
    return data(outcome, { status });
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("admin: the create-Client request failed", error);
    return data<CreateClientOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

async function readName(request: Request): Promise<string> {
  const form = await request.formData().catch(() => null);
  const name = form?.get("name");
  return typeof name === "string" ? name : "";
}

function getFieldError(error: CreateClientError, name: string): string {
  if (error === "duplicate-name") return CLIENT_NAME_COPY.duplicate;

  return getClientNameError(name) ?? CLIENT_NAME_COPY.blank;
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args) && !isNewClientDrawerToggle(args);
}

export default function AdminHome({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The layout's awaited list, also the sidebar's: one query, no loading
  // state of its own.
  const layoutData = useRouteLoaderData<typeof adminLayoutLoader>(
    ADMIN_LAYOUT_ROUTE_ID,
  );
  const isCreating = searchParams.get(NEW_CLIENT_PARAM) === NEW_CLIENT_VALUE;

  function handleCreateOpenChange(open: boolean): void {
    if (open) return;

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_CLIENT_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin" }, { label: "Home" }]}
        title="Clients"
        titleRef={titleRef}
        action={<NewClientLink />}
      />
      <ClientsPanel clients={loaderData.clients} />
      {layoutData && (
        <ArchivedClientsPanel
          clients={layoutData.archivedClients}
          fallbackFocusRef={titleRef}
        />
      )}
      <CreateClientDrawer
        open={isCreating}
        onOpenChange={handleCreateOpenChange}
      />
    </>
  );
}
