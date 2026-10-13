import type { MailMessage } from "@/lib/mailer/mailer";

// Email copy is confirmed by Franklin word for word (spec [F r3 Q1]).

export function buildMagicLinkEmail(to: string, url: string): MailMessage {
  const before = "Use this link to sign in to the Neves Labs client portal: ";
  const after =
    ". It expires in 15 minutes and works once. If you didn't ask for it, you can ignore this email.";
  const link = escapeHtml(url);
  return {
    to,
    subject: "Your Neves Labs portal sign-in link",
    text: `${before}${url}${after}`,
    html: `<p>${escapeHtml(before)}<a href="${link}">${link}</a>${escapeHtml(after)}</p>`,
  };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);
}
