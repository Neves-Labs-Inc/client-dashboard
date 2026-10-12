import { z } from "zod";

// The only module that reads process.env. Imported by the migrate script under
// plain Node, so it keeps relative `.ts` imports and erasable syntax only.

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL");

// Long enough for any real page query, short enough that a stuck database
// frees the request well before the platform kills it.
const DEFAULT_DB_QUERY_TIMEOUT_MS = 10_000;
// Ten minutes. Far above any real query, and well under the 2^31-1 ms where
// Node clamps timers to 1ms (every query would time out at once).
const MAX_DB_QUERY_TIMEOUT_MS = 600_000;

const appEnvSchema = z.object({
  DATABASE_URL_TENANT: postgresUrl,
  DATABASE_URL_SYSTEM: postgresUrl,
  DB_QUERY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_DB_QUERY_TIMEOUT_MS)
    .default(DEFAULT_DB_QUERY_TIMEOUT_MS),
});

const migrateEnvSchema = z.object({
  DATABASE_URL_OWNER: postgresUrl,
  APP_TENANT_PASSWORD: z.string().min(1),
  APP_SYSTEM_PASSWORD: z.string().min(1),
});

export type AppEnv = z.infer<typeof appEnvSchema>;
export type MigrateEnv = z.infer<typeof migrateEnvSchema>;

// Names the bad vars and why, never their values (they hold credentials).
function parseEnv<T>(schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")} (${issue.message})`,
    );
    throw new Error(`Invalid environment: ${problems.join(", ")}`);
  }
  return parsed.data;
}

export function getAppEnv(): AppEnv {
  return parseEnv(appEnvSchema);
}

export function getMigrateEnv(): MigrateEnv {
  return parseEnv(migrateEnvSchema);
}

// Build-time only: Vercel sets VERCEL=1 in its build environment.
export function isVercelBuild(): boolean {
  return Boolean(process.env.VERCEL);
}
