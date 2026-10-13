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

// "Oct 7" for the current year, "Jun 28, 2025" otherwise. Both the year check
// and the output use the business time zone, so server and client agree.
export function formatDate(date: Date, now: Date = new Date()): string {
  const isCurrentYear = YEAR_FORMAT.format(date) === YEAR_FORMAT.format(now);
  return (isCurrentYear ? SHORT_FORMAT : LONG_FORMAT).format(date);
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
