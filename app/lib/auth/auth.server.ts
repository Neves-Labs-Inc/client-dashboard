import { waitUntil } from "@vercel/functions";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { getAuthSettings } from "@/lib/auth/auth-env";
import { db } from "@/lib/db/db.server";
import { getAppEnv } from "@/lib/env";
import { mailer } from "@/lib/mailer/mailer.server";

// The app's one Auth. Server-only: it holds the signing secret.
export const auth: Auth = createAuth({
  db,
  mailer,
  // On Vercel this keeps the function alive until the email is out (it would
  // freeze once the response ends). Elsewhere it's a no-op and the promise
  // just runs on the long-lived server.
  runInBackground: waitUntil,
  ...getAuthSettings(getAppEnv()),
});
