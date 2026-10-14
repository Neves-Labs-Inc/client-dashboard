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
const MIN_CRON_SECRET_LENGTH = 32;
const MAX_PORT = 65_535;
// Implicit TLS. Credentials may only travel on it, never on a plain or
// STARTTLS-upgraded connection a downgrade could strip.
const SMTPS_PORT = 465;

// Plain http only for a local machine: anywhere else cookies would lose
// Secure and the passkey origin would be http.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Some env UIs flatten a multiline PEM into one line of literal `\n`s.
const PEM_PRIVATE_KEY =
  /^-----BEGIN [A-Z ]*PRIVATE KEY-----\n[\s\S]+\n-----END [A-Z ]*PRIVATE KEY-----$/;
const LITERAL_NEWLINE = /\\n/g;
// A key saved on Windows has CRLF line endings.
const CRLF = /\r\n/g;

// The GitHub App, all or none. Unset, board sync is off (CI and tests).
const GITHUB_VARS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_ORG",
] as const;

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
    // Google sign-in, both or neither. Unset, Google is off (CI and tests).
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_APP_ID: z.string().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z
      .string()
      .transform((key) =>
        key.replace(LITERAL_NEWLINE, "\n").replace(CRLF, "\n").trim(),
      )
      .refine((key) => PEM_PRIVATE_KEY.test(key), "must be a PEM private key")
      .optional(),
    GITHUB_APP_INSTALLATION_ID: z
      .string()
      .regex(/^[1-9][0-9]*$/, "must be a positive integer")
      .transform(Number)
      .optional(),
    GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
    GITHUB_ORG: z.string().min(1).optional(),
    // The bearer Vercel Cron sends to /jobs/reconcile. Unset, the job is off.
    CRON_SECRET: z.string().min(MIN_CRON_SECRET_LENGTH).optional(),
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
    if (
      env.GOOGLE_CLIENT_ID !== undefined &&
      env.GOOGLE_CLIENT_SECRET === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "must be set when GOOGLE_CLIENT_ID is",
      });
    }
    if (
      env.GOOGLE_CLIENT_SECRET !== undefined &&
      env.GOOGLE_CLIENT_ID === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "must be set when GOOGLE_CLIENT_SECRET is",
      });
    }
    const missingGithubVars = GITHUB_VARS.filter(
      (name) => env[name] === undefined,
    );
    const isGithubPartial =
      missingGithubVars.length > 0 &&
      missingGithubVars.length < GITHUB_VARS.length;
    if (isGithubPartial) {
      for (const name of missingGithubVars) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "must be set when any other GITHUB_ var is",
        });
      }
    }
  });

const migrateEnvSchema = z.object({
  DATABASE_URL_OWNER: postgresUrl,
  APP_TENANT_PASSWORD: z.string().min(1),
  APP_SYSTEM_PASSWORD: z.string().min(1),
});

// `pnpm dev:webhooks` only: the dev App's smee channel. The app never reads it.
const devWebhooksEnvSchema = z.object({
  SMEE_URL: z.url({ protocol: /^https$/ }),
});

export type AppEnv = z.infer<typeof appEnvSchema>;
export type MigrateEnv = z.infer<typeof migrateEnvSchema>;
export type DevWebhooksEnv = z.infer<typeof devWebhooksEnvSchema>;

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

export function getDevWebhooksEnv(): DevWebhooksEnv {
  return parseEnv(devWebhooksEnvSchema);
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
