import nodemailer, { type Transporter } from "nodemailer";
import type { MailMessage, Mailer } from "@/lib/mailer/mailer";

const SENDER_NAME = "Neves Labs";
// Implicit TLS; any other port is plain (Mailpit). Env validation only allows
// credentials on this port.
const SMTPS_PORT = 465;

type SmtpConfig = {
  host: string;
  port: number;
  user: string | undefined;
  password: string | undefined;
  from: string;
};

export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    const hasCredentials =
      config.user !== undefined && config.password !== undefined;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === SMTPS_PORT,
      ...(hasCredentials
        ? { auth: { user: config.user, pass: config.password } }
        : {}),
    });
    this.from = config.from;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: { name: SENDER_NAME, address: this.from },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
