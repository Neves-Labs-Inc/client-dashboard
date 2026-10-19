import { migrateDatabase } from "@/lib/db/migrate";
import { getMigrateEnv } from "@/lib/env";
import pg from "pg";
import { resetInvoiceCounters } from "./support/invoices";

// Loads .env.test without overriding vars already set (CI sets them inline),
// then brings the test database up to date before any suite runs. Invoice
// counters restart each run, so test seeds never exhaust a year's sequence.
export default async function setup(): Promise<void> {
  process.loadEnvFile(".env.test");
  const env = getMigrateEnv();
  await migrateDatabase({
    ownerUrl: env.DATABASE_URL_OWNER,
    tenantPassword: env.APP_TENANT_PASSWORD,
    systemPassword: env.APP_SYSTEM_PASSWORD,
  });
  const owner = new pg.Client({ connectionString: env.DATABASE_URL_OWNER });
  await owner.connect();
  try {
    await resetInvoiceCounters(owner);
  } finally {
    await owner.end();
  }
}
