import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import RequestsInboxView from "@/components/admin/requests-inbox-view";
import { getInboxFilter, type InboxFilter } from "@/lib/admin-requests";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import type { AdminRequestRow } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/requests";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Requests inbox · Neves Labs Admin" }];
}

// Awaited, not streamed: the admin layout shows the skeleton during
// client-side navigation. A failed load resolves to null (the panel's error
// state), so the shell stays and the real error is logged here only.
export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  const filter = getInboxFilter(new URL(request.url).searchParams);
  const rows = await loadInbox(filter);

  return data({ filter, rows }, { headers });
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

async function loadInbox(
  filter: InboxFilter,
): Promise<AdminRequestRow[] | null> {
  try {
    return await requests.listInbox(filter);
  } catch (error) {
    console.error(
      `admin: couldn't load the Requests inbox (${describeError(error)})`,
      { filter },
    );
    return null;
  }
}

export default function RequestsInbox({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  return (
    <RequestsInboxView filter={loaderData.filter} rows={loaderData.rows} />
  );
}
