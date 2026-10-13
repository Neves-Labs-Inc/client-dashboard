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

const MIN_AUTH_SECRET_LENGTH = 32;
const MAX_PORT = 65_535;
// Implicit TLS. Credentials may only travel on it, never on a plain or
// STARTTLS-upgraded connection a downgrade could strip.
const SMTPS_PORT = 465;

// Plain http only for a local machine: anywhere else cookies would lose
// Secure and the passkey origin would be http.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const httpOrigin = z
  .string()
  .refine(
    isHttpOrigin,
    "must be an https origin (http only for localhost) with no trailing slash or path",
  );

const appEnvSchema = z
  .object({
    DATABASE_URL_TENANT: postgresUrl,
    DATABASE_URL_SYSTEM: postgresUrl,
    DB_QUERY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_DB_QUERY_TIMEOUT_MS)
      .default(DEFAULT_DB_QUERY_TIMEOUT_MS),
    BETTER_AUTH_SECRET: z.string().min(MIN_AUTH_SECRET_LENGTH),
    BETTER_AUTH_URL: httpOrigin,
    // Lowercased here so every comparison is case-insensitive.
    ADMIN_EMAIL: z.email().transform((email) => email.toLowerCase()),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(MAX_PORT),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.email(),
    // Set to 1 by Vercel at build and run time. Vercel overwrites
    // x-forwarded-for with the client IP, so only then is it trusted.
    VERCEL: z
      .string()
      .optional()
      .transform((value) => Boolean(value)),
  })
  .superRefine((env, context) => {
    if (env.SMTP_USER !== undefined && env.SMTP_PASSWORD === undefined) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_PASSWORD"],
        message: "must be set when SMTP_USER is",
      });
    }
    if (env.SMTP_PASSWORD !== undefined && env.SMTP_USER === undefined) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "must be set when SMTP_PASSWORD is",
      });
    }
    if (env.SMTP_PASSWORD !== undefined && env.SMTP_PORT !== SMTPS_PORT) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_PORT"],
        message: `must be ${SMTPS_PORT} when SMTP_PASSWORD is set`,
      });
    }
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

// `new URL(...).origin` drops any trailing slash or path, so equality means
// the value is a bare origin.
function isHttpOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);
  const isAllowedProtocol =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname));
  return isAllowedProtocol && url.origin === value;
}

// Build-time only: Vercel sets VERCEL=1 in its build environment.
export function isVercelBuild(): boolean {
  return Boolean(process.env.VERCEL);
}
