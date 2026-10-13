import { getAppEnv } from "@/lib/env";
import type { Mailer } from "@/lib/mailer/mailer";
import { SmtpMailer } from "@/lib/mailer/smtp-mailer";

// The app's one Mailer. Server-only: it holds the SMTP credentials. Only the
// auth module's server instance uses it.
const env = getAppEnv();

export const mailer: Mailer = new SmtpMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  user: env.SMTP_USER,
  password: env.SMTP_PASSWORD,
  from: env.MAIL_FROM,
});
