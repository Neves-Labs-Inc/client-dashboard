import {
  data,
  redirect,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { requireAdmin } from "@/lib/auth/require-access.server";
import { getTeamPath } from "@/lib/new-client";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/client";

const METHOD_NOT_ALLOWED = 405;

// A Client's workspace opens on its Team tab. The guard runs first, so the
// redirect reveals nothing to a visitor.
export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw redirect(getTeamPath(encodeURIComponent(params.clientId)), {
    headers,
  });
}

export async function action({ request }: Route.ActionArgs): Promise<never> {
  const { headers } = await requireAdmin(request);
  throw data(null, { status: METHOD_NOT_ALLOWED, headers });
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}
