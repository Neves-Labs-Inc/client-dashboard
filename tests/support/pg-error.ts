type PgError = { code: string; message: string };

// The Postgres error behind a failed query, or null if it isn't one. Drizzle
// wraps the pg error in `cause`; raw pg errors carry `code` directly.
export function getPgError(error: unknown): PgError | null {
  if (!(error instanceof Error)) return null;

  const source = error.cause instanceof Error ? error.cause : error;
  const code = "code" in source ? source.code : null;
  return typeof code === "string" ? { code, message: source.message } : null;
}
