import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getAppEnv } from "@/lib/env";
import { SmtpMailer } from "@/lib/mailer/smtp-mailer";
import {
  deleteMailpitMessages,
  findMailpitMessage,
} from "../../support/mailpit";

const env = getAppEnv();
const sentIds: string[] = [];

afterAll(async () => {
  await deleteMailpitMessages(sentIds);
});

function createMailer(port = env.SMTP_PORT): SmtpMailer {
  return new SmtpMailer({
    host: env.SMTP_HOST,
    port,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.MAIL_FROM,
  });
}

describe("SmtpMailer", () => {
  it("delivers from, to, subject, text and HTML through SMTP", async () => {
    const to = `smtp-${randomUUID()}@example.test`;

    await createMailer().send({
      to,
      subject: "Mailer test",
      text: "Plain body https://example.test/link",
      html: '<p>HTML body <a href="https://example.test/link">link</a></p>',
    });

    const message = await findMailpitMessage(to);
    sentIds.push(message.ID);
    expect(message.From).toEqual({
      Name: "Neves Labs",
      Address: env.MAIL_FROM,
    });
    expect(message.To).toEqual([{ Name: "", Address: to }]);
    expect(message.Subject).toBe("Mailer test");
    expect(message.Text.trim()).toBe("Plain body https://example.test/link");
    expect(message.HTML.trim()).toBe(
      '<p>HTML body <a href="https://example.test/link">link</a></p>',
    );
  });

  it("throws when the SMTP server can't be reached", async () => {
    const send = createMailer(1).send({
      to: "nobody@example.test",
      subject: "Unreachable",
      text: "text",
      html: "<p>html</p>",
    });

    await expect(send).rejects.toThrow();
  });
});
