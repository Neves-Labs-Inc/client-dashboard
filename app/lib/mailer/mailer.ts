// The mailer seam. Only the auth module sends mail; nothing else knows the
// provider (Gmail SMTP on prod, Mailpit locally and in CI).

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type Mailer = {
  // Throws when the message can't be handed to the provider.
  send(message: MailMessage): Promise<void>;
};
