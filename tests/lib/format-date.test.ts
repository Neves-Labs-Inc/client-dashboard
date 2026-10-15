import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/format-date";

// Intl may separate the time from AM/PM with a narrow no-break space.
function normalizeSpaces(text: string): string {
  return text.replace(/\s/g, " ");
}

describe("formatDateTime", () => {
  const now = new Date("2026-10-14T19:00:00Z");

  it("leaves the year out for the current year, in New York time", () => {
    const date = new Date("2026-10-14T19:42:00Z");
    expect(normalizeSpaces(formatDateTime(date, now))).toBe("Oct 14, 3:42 PM");
  });

  it("shows the year for another year", () => {
    const date = new Date("2025-06-28T19:42:00Z");
    expect(normalizeSpaces(formatDateTime(date, now))).toBe(
      "Jun 28, 2025, 3:42 PM",
    );
  });

  it("uses the business day, not UTC's, near midnight", () => {
    const date = new Date("2026-10-15T02:30:00Z");
    expect(normalizeSpaces(formatDateTime(date, now))).toBe("Oct 14, 10:30 PM");
  });
});
