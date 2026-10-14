// A Client's name rules, shared by the create drawer (instant feedback) and
// the auth module (the authority).

export const MAX_CLIENT_NAME_LENGTH = 100;

export const CLIENT_NAME_COPY = {
  blank: "Enter a name.",
  tooLong: `Use ${MAX_CLIENT_NAME_LENGTH} characters or fewer.`,
  hiddenCharacters: "Remove line breaks and hidden characters.",
  duplicate: "A Client with this name already exists.",
} as const;

// Characters that are invisible, blank or reorder text, so they could make a
// lookalike of another Client's name or break an email header: controls
// (CR/LF, tab), format characters (zero-width, bidi controls, soft hyphen,
// BOM), line/paragraph separators, private-use and unassigned code points,
// and the fillers that render blank (Hangul fillers, braille blank). ZWNJ
// (U+200C) and ZWJ (U+200D) are allowed: Persian, Indic scripts and emoji
// sequences need them.
const HIDDEN_CHARACTERS =
  /(?![\u200C\u200D])\p{Cf}|[\p{Cc}\p{Zl}\p{Zp}\p{Co}\p{Cn}\u115F\u1160\u2800\u3164\uFFA0]/u;
const WHITESPACE_RUN = /\s+/gu;

export function hasHiddenCharacters(text: string): boolean {
  return HIDDEN_CHARACTERS.test(text);
}

// The stored form: NFC (so a decomposed accent matches a composed one under
// the unique lower(name) index), whitespace runs collapsed to one space, and
// trimmed.
export function normalizeClientName(name: string): string {
  return name.normalize("NFC").replace(WHITESPACE_RUN, " ").trim();
}

// The field error for a name, or null when it's valid. Counts characters
// (code points), as Postgres does, not UTF-16 units.
export function getClientNameError(name: string): string | null {
  if (hasHiddenCharacters(name)) return CLIENT_NAME_COPY.hiddenCharacters;

  const length = Array.from(normalizeClientName(name)).length;
  if (length === 0) return CLIENT_NAME_COPY.blank;

  return length > MAX_CLIENT_NAME_LENGTH ? CLIENT_NAME_COPY.tooLong : null;
}
