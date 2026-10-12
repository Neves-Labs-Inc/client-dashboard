import { createDb, type Db } from "@/lib/db/db";
import { getAppEnv } from "@/lib/env";

// The app's one Db. Server-only: it holds the pools and their credentials.
// Built at import, so a missing var fails as soon as the server loads it.
const env = getAppEnv();

export const db: Db = createDb({
  tenantUrl: env.DATABASE_URL_TENANT,
  systemUrl: env.DATABASE_URL_SYSTEM,
  queryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
});
