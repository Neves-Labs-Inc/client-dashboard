// A Client User's name may be empty: the email stands in for it.
export function getDisplayName(name: string, email: string): string {
  return name.trim() || email;
}

// The first letters of the name's first and last words (one for a one-word
// name), or the email's first letter when there is no name.
export function getInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const sources =
    words.length > 1
      ? [words[0], words[words.length - 1]]
      : [words[0] ?? email];
  return sources
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
