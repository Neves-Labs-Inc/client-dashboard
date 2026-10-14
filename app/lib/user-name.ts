import { hasHiddenCharacters, normalizeClientName } from "@/lib/client-name";

// A Client User's display name rules, shared by the Profile form (instant
// feedback) and the auth module (the authority).

export const MAX_USER_NAME_LENGTH = 100;

// More combining marks in a row than any real script stacks make a smear
// that spills over neighbouring rows ("Zalgo"). Checked after NFC; a joiner
// between marks doesn't break the run.
const COMBINING_MARK_STACK = /(?:\p{M}[\u200C\u200D]*){4,}/u;

// The stored form: NFC, whitespace runs collapsed to one space, trimmed.
export function normalizeUserName(name: string): string {
  return normalizeClientName(name);
}

// 1 to 100 characters (code points, as Postgres counts) once normalised, no
// control, format or other hidden characters, no stack of combining marks, and
// no "@" (a name must not pass for an email address in "Name (email)").
export function isValidUserName(name: string): boolean {
  if (hasHiddenCharacters(name) || name.includes("@")) return false;

  const normalized = normalizeUserName(name);
  const length = Array.from(normalized).length;
  return (
    length >= 1 &&
    length <= MAX_USER_NAME_LENGTH &&
    !COMBINING_MARK_STACK.test(normalized)
  );
}
