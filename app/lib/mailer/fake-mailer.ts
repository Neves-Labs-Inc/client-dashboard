import type { MailMessage, Mailer } from "@/lib/mailer/mailer";

// Test adapter: records every message instead of sending it. `failWith` makes
// the next sends throw, to exercise callers' failure handling.
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failWith: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;

    this.sent.push(message);
  }
}
