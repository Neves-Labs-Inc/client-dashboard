import { getMigrateEnv } from "../app/lib/env.ts";
import { migrateDatabase } from "../app/lib/db/migrate.ts";

// `pnpm db:migrate`: run by Node directly (type stripping), locally and by the
// deploy job. Any failure exits non-zero so the deploy stops.
try {
  const env = getMigrateEnv();
  await migrateDatabase({
    ownerUrl: env.DATABASE_URL_OWNER,
    tenantPassword: env.APP_TENANT_PASSWORD,
    systemPassword: env.APP_SYSTEM_PASSWORD,
  });
  console.log(
    "db:migrate: migrations applied, role attributes and passwords set",
  );
} catch (error) {
  // Messages only, no params: errors must never echo a password.
  console.error(`db:migrate failed: ${describeError(error)}`);
  process.exitCode = 1;
}

// Drizzle wraps the Postgres error (the useful part) in `cause`.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const firstLine = error.message.split("\n")[0];
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${firstLine}${cause}`;
}
