// An invitee's email rules, shared by the invite drawer (instant feedback)
// and the auth module (the authority).

// RFC 5321's limit on a forward path.
const MAX_EMAIL_LENGTH = 254;
// Characters that could break an email header or body, or hide in an
// address: controls (CR/LF, tab), format characters (zero-width, bidi), and
// line and paragraph separators. Refused anywhere, the ends included.
const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const WHITESPACE = /\s/u;
// One mailbox, no display name, comments or lists: a comma, quote or angle
// bracket could make the mailer address someone else.
const LOCAL_PART =
  "[\\p{L}\\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\\.[\\p{L}\\p{N}!#$%&'*+/=?^_`{|}~-]+)*";
const DOMAIN_LABEL = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?";
const EMAIL_PATTERN = new RegExp(
  `^${LOCAL_PART}@${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+$`,
  "u",
);

export const INVITE_EMAIL_COPY = {
  invalid: "Enter a valid email.",
} as const;

// The stored form (trimmed, NFC, lowercase), or null when it isn't one
// plain, valid address.
export function normalizeInviteEmail(email: string): string | null {
  if (HIDDEN_CHARACTERS.test(email)) return null;

  const normalized = email.trim().normalize("NFC").toLowerCase();
  if (WHITESPACE.test(normalized)) return null;
  if (normalized.length > MAX_EMAIL_LENGTH) return null;

  return EMAIL_PATTERN.test(normalized) ? normalized : null;
}
