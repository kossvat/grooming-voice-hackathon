import { describe, expect, it } from "vitest";
import {
  dateStrFromIso,
  intervalsOverlap,
  isValidCalendarDateStr,
  studioDateTime,
  timeStrFromIso,
  weekdayOfDate,
} from "./time";

describe("weekdayOfDate", () => {
  it("matches the reference date's actual weekday", () => {
    expect(weekdayOfDate("2026-09-19")).toBe("saturday"); // reference_date in demo-data.json
    expect(weekdayOfDate("2026-09-20")).toBe("sunday");
    expect(weekdayOfDate("2026-09-21")).toBe("monday");
    expect(weekdayOfDate("2026-09-22")).toBe("tuesday");
    expect(weekdayOfDate("2026-09-23")).toBe("wednesday");
  });

  it("throws on an impossible calendar date instead of returning a wrong weekday", () => {
    expect(() => weekdayOfDate("2026-02-30")).toThrow("invalid_calendar_date");
    expect(() => weekdayOfDate("2026-13-01")).toThrow("invalid_calendar_date");
    expect(() => weekdayOfDate("not-a-date")).toThrow("invalid_calendar_date");
  });
});

describe("isValidCalendarDateStr", () => {
  it("accepts real dates", () => {
    expect(isValidCalendarDateStr("2026-09-20")).toBe(true);
    expect(isValidCalendarDateStr("2026-02-28")).toBe(true);
  });

  it("rejects impossible dates", () => {
    expect(isValidCalendarDateStr("2026-02-30")).toBe(false);
    expect(isValidCalendarDateStr("2026-13-01")).toBe(false);
    expect(isValidCalendarDateStr("2026-00-10")).toBe(false);
    expect(isValidCalendarDateStr("2026-09-31")).toBe(false);
    expect(isValidCalendarDateStr("garbage")).toBe(false);
  });
});

describe("studioDateTime — America/New_York EDT/EST correctness", () => {
  it("September (EDT, UTC-4): 14:30 local -> 18:30Z", () => {
    const instant = studioDateTime("2026-09-20", "14:30");
    expect(instant.toISOString()).toBe("2026-09-20T18:30:00.000Z");
  });

  it("January (EST, UTC-5): 14:30 local -> 19:30Z", () => {
    const instant = studioDateTime("2026-01-20", "14:30");
    expect(instant.toISOString()).toBe("2026-01-20T19:30:00.000Z");
  });

  it("throws on impossible calendar date", () => {
    expect(() => studioDateTime("2026-02-30", "10:00")).toThrow();
  });

  it("throws on malformed time-of-day", () => {
    expect(() => studioDateTime("2026-09-20", "25:00")).toThrow();
    expect(() => studioDateTime("2026-09-20", "10:70")).toThrow();
    expect(() => studioDateTime("2026-09-20", "garbage")).toThrow();
  });
});

describe("dateStrFromIso / timeStrFromIso", () => {
  it("extracts studio-local date/time from a -04:00 instant", () => {
    expect(dateStrFromIso("2026-09-20T14:30:00-04:00")).toBe("2026-09-20");
    expect(timeStrFromIso("2026-09-20T14:30:00-04:00")).toBe("14:30");
  });

  it("extracts studio-local date/time from a winter -05:00 instant correctly via IANA rules", () => {
    // 19:30 UTC in January is 14:30 EST (UTC-5), not the old fixed -04:00 assumption.
    expect(dateStrFromIso("2026-01-20T19:30:00Z")).toBe("2026-01-20");
    expect(timeStrFromIso("2026-01-20T19:30:00Z")).toBe("14:30");
  });

  it("throws on an unparseable ISO instant instead of returning garbage text", () => {
    expect(() => dateStrFromIso("not-a-date")).toThrow("invalid_iso_instant");
    expect(() => timeStrFromIso("not-a-date")).toThrow("invalid_iso_instant");
  });
});

describe("intervalsOverlap", () => {
  it("detects overlap", () => {
    const a1 = new Date("2026-09-20T10:00:00-04:00");
    const a2 = new Date("2026-09-20T11:00:00-04:00");
    const b1 = new Date("2026-09-20T10:30:00-04:00");
    const b2 = new Date("2026-09-20T11:30:00-04:00");
    expect(intervalsOverlap(a1, a2, b1, b2)).toBe(true);
  });

  it("touching edges (half-open) do not overlap", () => {
    const a1 = new Date("2026-09-20T10:00:00-04:00");
    const a2 = new Date("2026-09-20T11:00:00-04:00");
    const b1 = new Date("2026-09-20T11:00:00-04:00");
    const b2 = new Date("2026-09-20T12:00:00-04:00");
    expect(intervalsOverlap(a1, a2, b1, b2)).toBe(false);
  });

  it("disjoint intervals do not overlap", () => {
    const a1 = new Date("2026-09-20T09:00:00-04:00");
    const a2 = new Date("2026-09-20T10:00:00-04:00");
    const b1 = new Date("2026-09-20T11:00:00-04:00");
    const b2 = new Date("2026-09-20T12:00:00-04:00");
    expect(intervalsOverlap(a1, a2, b1, b2)).toBe(false);
  });

  it("throws on Invalid Date input instead of NaN comparisons silently failing open", () => {
    const valid = new Date("2026-09-20T10:00:00-04:00");
    const invalid = new Date("not-a-date");
    expect(() => intervalsOverlap(invalid, valid, valid, valid)).toThrow("invalid_instant");
    expect(() => intervalsOverlap(valid, invalid, valid, valid)).toThrow("invalid_instant");
    expect(() => intervalsOverlap(valid, valid, invalid, valid)).toThrow("invalid_instant");
    expect(() => intervalsOverlap(valid, valid, valid, invalid)).toThrow("invalid_instant");
  });
});
