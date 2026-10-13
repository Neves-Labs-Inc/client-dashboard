import type { Route } from "./+types/api.auth";
import { auth } from "@/lib/auth/auth.server";

// Resource route: every /api/auth/* request goes to Better Auth's handler.

export function loader({ request }: Route.LoaderArgs): Promise<Response> {
  return auth.handler(request);
}

export function action({ request }: Route.ActionArgs): Promise<Response> {
  return auth.handler(request);
}
