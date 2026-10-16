const BUSINESS_TIME_ZONE = "America/New_York";

const YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});
const SHORT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});
const LONG_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});

const SHORT_DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});
const LONG_DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

function isCurrentYear(date: Date, now: Date): boolean {
  return YEAR_FORMAT.format(date) === YEAR_FORMAT.format(now);
}

// "Oct 7" for the current year, "Jun 28, 2025" otherwise. Both the year check
// and the output use the business time zone, so server and client agree.
export function formatDate(date: Date, now: Date = new Date()): string {
  return (isCurrentYear(date, now) ? SHORT_FORMAT : LONG_FORMAT).format(date);
}

// "Oct 14, 3:42 PM" for the current year, "Jun 28, 2025, 3:42 PM"
// otherwise, in the business time zone like formatDate.
export function formatDateTime(date: Date, now: Date = new Date()): string {
  const format = isCurrentYear(date, now)
    ? SHORT_DATE_TIME_FORMAT
    : LONG_DATE_TIME_FORMAT;
  return format.format(date);
}

// Date-only, in the business time zone: stable between server and client
// renders (no millisecond drift) and the date the visible text shows.
const ISO_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

export function formatIsoDate(date: Date): string {
  return ISO_DATE_FORMAT.format(date);
}

// A date-only value ("2026-11-14", a `date` column) as an instant at noon
// UTC: midnight UTC would format as the previous evening in New York.
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}
