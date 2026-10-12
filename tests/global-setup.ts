import { migrateDatabase } from "@/lib/db/migrate";
import { getMigrateEnv } from "@/lib/env";

// Loads .env.test without overriding vars already set (CI sets them inline),
// then brings the test database up to date before any suite runs.
export default async function setup(): Promise<void> {
  process.loadEnvFile(".env.test");
  const env = getMigrateEnv();
  await migrateDatabase({
    ownerUrl: env.DATABASE_URL_OWNER,
    tenantPassword: env.APP_TENANT_PASSWORD,
    systemPassword: env.APP_SYSTEM_PASSWORD,
  });
}
