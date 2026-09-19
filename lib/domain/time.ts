// Studio-local time helpers, using real IANA timezone data via date-fns-tz
// so America/New_York is handled correctly across the EDT/EST transition
// (a fixed -04:00 offset was a bug: wrong from the first Sunday of November
// to the second Sunday of March).

import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const STUDIO_TIMEZONE = "America/New_York";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_STR_RE = /^\d{2}:\d{2}$/;

/** True only for a real calendar date, e.g. rejects 2026-02-30 or 2026-13-01. */
export function isValidCalendarDateStr(dateStr: string): boolean {
  if (!DATE_STR_RE.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}

function assertValidDateStr(dateStr: string): void {
  if (!isValidCalendarDateStr(dateStr)) {
    throw new Error(`invalid_calendar_date: ${dateStr}`);
  }
}

function assertValidTimeStr(timeStr: string): void {
  if (!TIME_STR_RE.test(timeStr)) {
    throw new Error(`invalid_time_of_day: ${timeStr}`);
  }
  const [h, min] = timeStr.split(":").map(Number);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error(`invalid_time_of_day: ${timeStr}`);
  }
}

/** "YYYY-MM-DD" -> weekday, validating the date is a real calendar date first. */
export function weekdayOfDate(dateStr: string): Weekday {
  assertValidDateStr(dateStr);
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[dow];
}

/**
 * Combines a "YYYY-MM-DD" date and "HH:mm" studio-local time into the
 * correct UTC instant, honoring EDT/EST via the IANA America/New_York rules.
 * Throws on a malformed or impossible calendar date/time rather than
 * silently producing an Invalid Date.
 */
export function studioDateTime(dateStr: string, timeStr: string): Date {
  assertValidDateStr(dateStr);
  assertValidTimeStr(timeStr);
  const instant = fromZonedTime(`${dateStr}T${timeStr}:00`, STUDIO_TIMEZONE);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`invalid_studio_datetime: ${dateStr}T${timeStr}`);
  }
  return instant;
}

/** Extracts "YYYY-MM-DD" (studio-local calendar date) from a UTC instant. Throws on Invalid Date. */
export function dateStrFromInstant(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("invalid_instant");
  }
  const zoned = toZonedTime(instant, STUDIO_TIMEZONE);
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Extracts "HH:mm" (studio-local) from a UTC instant. Throws on Invalid Date. */
export function timeStrFromInstant(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("invalid_instant");
  }
  const zoned = toZonedTime(instant, STUDIO_TIMEZONE);
  const h = String(zoned.getHours()).padStart(2, "0");
  const min = String(zoned.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/**
 * Parses a stored ISO instant string (any offset, e.g. the seed file's
 * "-04:00" literals) into studio-local "YYYY-MM-DD"/"HH:mm". Throws on an
 * unparseable string instead of returning "NaN"-derived text.
 */
export function dateStrFromIso(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`invalid_iso_instant: ${iso}`);
  }
  return dateStrFromInstant(instant);
}

export function timeStrFromIso(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`invalid_iso_instant: ${iso}`);
  }
  return timeStrFromInstant(instant);
}

export function addMinutes(date: Date, minutes: number): Date {
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_instant");
  }
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * True if [aStart,aEnd) overlaps [bStart,bEnd). Half-open intervals: touching
 * edges do not overlap. Throws on any Invalid Date input rather than letting
 * NaN comparisons silently evaluate to false (which fails OPEN — i.e. would
 * wrongly report "no overlap" for garbage input).
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  for (const d of [aStart, aEnd, bStart, bEnd]) {
    if (Number.isNaN(d.getTime())) {
      throw new Error("invalid_instant");
    }
  }
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
