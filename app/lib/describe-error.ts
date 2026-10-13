// An error for a log line: its name and code (e.g. "Error ECONNREFUSED"),
// never its message. Driver and provider messages can carry bound
// parameters (an invitee's email) or an SMTP user.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";

  const source = error.cause instanceof Error ? error.cause : error;
  const code = "code" in source ? ` ${String(source.code)}` : "";
  return `${error.name}${code}`;
}
