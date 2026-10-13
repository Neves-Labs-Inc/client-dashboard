import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import ClientsPanel from "@/components/admin/clients-panel";
import NewClientLink from "@/components/admin/new-client-link";
import PageHeader from "@/components/ui/page-header";
import { auth } from "@/lib/auth/auth.server";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/index";

const METHOD_NOT_ALLOWED = 405;

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

// A POST to /admin?index lands here instead of the layout, so it runs the
// guard itself.
export async function action({ request }: Route.ActionArgs): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw data(null, { status: METHOD_NOT_ALLOWED, headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

export default function AdminHome({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin" }, { label: "Home" }]}
        title="Clients"
        action={<NewClientLink />}
      />
      <ClientsPanel clients={loaderData.clients} />
    </>
  );
}
