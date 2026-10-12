import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Runs under plain Node (type stripping) from scripts/db-migrate.ts, so imports
// stay relative with `.ts` extensions and syntax stays erasable.

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../drizzle", import.meta.url),
);

// Re-asserted on every migrate, not only when the roles migration first runs:
// app_tenant must stay subject to RLS (ADR 0003).
const ROLE_ATTRIBUTES = {
  app_tenant: "LOGIN NOBYPASSRLS",
  app_system: "LOGIN BYPASSRLS",
} as const;

type AppRole = keyof typeof ROLE_ATTRIBUTES;

type MigrateConfig = {
  ownerUrl: string;
  tenantPassword: string;
  systemPassword: string;
};

// Applies pending migrations as the owner, then sets both roles' attributes and
// passwords. Throws if either step fails, so a failed migrate blocks the deploy.
export async function migrateDatabase(config: MigrateConfig): Promise<void> {
  const client = new pg.Client({ connectionString: config.ownerUrl });
  await client.connect();
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    await setRole(client, "app_tenant", config.tenantPassword);
    await setRole(client, "app_system", config.systemPassword);
  } finally {
    await client.end();
  }
}

// ALTER ROLE takes no bind parameters, so the server quotes the password with
// format(%L) and we execute the statement it returns. Never log either.
async function setRole(
  client: pg.Client,
  role: AppRole,
  password: string,
): Promise<void> {
  const built = await client.query<{ statement: string }>(
    `select format('ALTER ROLE %I ${ROLE_ATTRIBUTES[role]} PASSWORD %L',
      $1::text, $2::text) as statement`,
    [role, password],
  );
  await client.query(built.rows[0].statement);
}
