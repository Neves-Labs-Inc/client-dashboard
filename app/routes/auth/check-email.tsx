import { data, type ShouldRevalidateFunctionArgs } from "react-router";
import BackToSignInLink from "@/components/auth/back-to-sign-in-link";
import { requireAccess } from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/check-email";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Check your email · Neves Labs" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAccess(request, ["anonymous"]);
  return data(null, { headers });
}

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return revalidateUnlessThemeFailed(args);
}

// Identical for every email, and never echoes it, so it reveals nothing.
export default function CheckEmail(): React.ReactNode {
  return (
    <>
      <h1 className="text-lg/6 font-semibold text-fg">Check your email</h1>
      <p className="text-sm/5 text-fg">
        If this email can sign in, a link is on its way. It expires in 15
        minutes.
      </p>
      <BackToSignInLink />
    </>
  );
}
