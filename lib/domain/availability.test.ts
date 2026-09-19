import { describe, expect, it } from "vitest";
import {
  checkAvailability,
  findAvailableSlots,
  SeedAvailabilityRepository,
} from "./availability";

const repo = new SeedAvailabilityRepository();

function studioTime(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00-04:00`);
}

// "Now" fixed well before the demo window so date-str comparisons
// (past/horizon) in findAvailableSlots are deterministic in tests.
const FIXED_NOW = new Date("2026-09-19T12:00:00-04:00");

describe("checkAvailability — seed scenarios from demo-data.json", () => {
  it("Sunday Sep20 Anna 14:30 small Full Groom is available (the demo booking slot)", () => {
    const result = checkAvailability(repo, {
      serviceId: "groom_s",
      staffId: "anna",
      dateStr: "2026-09-20",
      startAt: studioTime("2026-09-20", "14:30"),
    });
    expect(result).toEqual({ available: true });
  });

  it("Sunday Sep20 Maria 16:00 small Full Groom is available", () => {
    const result = checkAvailability(repo, {
      serviceId: "groom_s",
      staffId: "maria",
      dateStr: "2026-09-20",
      startAt: studioTime("2026-09-20", "16:00"),
    });
    expect(result).toEqual({ available: true });
  });

  it("Monday Sep21 is closed", () => {
    const result = checkAvailability(repo, {
      serviceId: "groom_s",
      staffId: "anna",
      dateStr: "2026-09-21",
      startAt: studioTime("2026-09-21", "14:30"),
    });
    expect(result).toEqual({ available: false, reason: "closed_day" });
  });

  it("Anna Sunday 10:30 overlaps the seeded 10:00-11:45 appointment", () => {
    const result = checkAvailability(repo, {
      serviceId: "bath_s",
      staffId: "anna",
      dateStr: "2026-09-20",
      startAt: studioTime("2026-09-20", "10:30"),
    });
    expect(result).toEqual({
      available: false,
      reason: "overlaps_block_or_appointment",
    });
  });

  it("small bath at 12:00 intrudes on 13:00 break due to cleanup buffer", () => {
    // bath_s = 60min + 15min cleanup = occupied until 13:15, overlapping 13:00-14:00 break.
    const result = checkAvailability(repo, {
      serviceId: "bath_s",
      staffId: "maria",
      dateStr: "2026-09-23",
      startAt: studioTime("2026-09-23", "12:00"),
    });
    expect(result).toEqual({ available: false, reason: "overlaps_break" });
  });

  it("medium full groom at 17:00 exceeds closing (120min+15 > close at 18:00)", () => {
    const result = checkAvailability(repo, {
      serviceId: "groom_m",
      staffId: "maria",
      dateStr: "2026-09-22",
      startAt: studioTime("2026-09-22", "17:00"),
    });
    expect(result).toEqual({ available: false, reason: "outside_hours" });
  });

  it("unknown staff/service combination is rejected", () => {
    const result = checkAvailability(repo, {
      // @ts-expect-error deliberately invalid for the test
      serviceId: "not_a_service",
      staffId: "anna",
      dateStr: "2026-09-20",
      startAt: studioTime("2026-09-20", "10:00"),
    });
    expect(result).toEqual({
      available: false,
      reason: "unknown_staff_or_service",
    });
  });

  it("unknown staff id is rejected safely, not thrown", () => {
    const result = checkAvailability(repo, {
      serviceId: "bath_s",
      // @ts-expect-error deliberately invalid for the test
      staffId: "not_a_staff_member",
      dateStr: "2026-09-20",
      startAt: studioTime("2026-09-20", "10:00"),
    });
    expect(result).toEqual({
      available: false,
      reason: "unknown_staff_or_service",
    });
  });

  it("impossible calendar date fails closed instead of throwing", () => {
    const result = checkAvailability(repo, {
      serviceId: "bath_s",
      staffId: "anna",
      dateStr: "2026-02-30",
      startAt: new Date("2026-02-30T10:00:00-05:00"),
    });
    expect(result).toEqual({ available: false, reason: "invalid_request" });
  });

  it("Invalid Date startAt fails closed instead of throwing or failing open", () => {
    const result = checkAvailability(repo, {
      serviceId: "bath_s",
      staffId: "anna",
      dateStr: "2026-09-20",
      startAt: new Date("not-a-date"),
    });
    expect(result).toEqual({ available: false, reason: "invalid_request" });
  });

  it("correctly applies EDT offset (Sep, UTC-4) for a September slot", () => {
    // 2026-09-20T14:30 America/New_York = 18:30Z in EDT (not 19:30Z, which
    // would be the EST -05:00 offset — the fixed-offset bug used to hard
    // code EDT everywhere, so this failing would have been silently masked
    // rather than caught, and the winter-EST test below is what actually
    // guards this).
    const result = checkAvailability(repo, {
      serviceId: "groom_s",
      staffId: "anna",
      dateStr: "2026-09-20",
      startAt: new Date("2026-09-20T18:30:00Z"),
    });
    expect(result).toEqual({ available: true });
  });

  it("correctly applies EST offset (January, UTC-5) for a winter slot", () => {
    // 2026-01-20T14:30 America/New_York = 19:30Z in EST. Using the old
    // fixed -04:00 offset, studioDateTime would compute open/close times
    // one hour off from the real EST hours, misjudging this slot.
    const result = checkAvailability(repo, {
      serviceId: "bath_s",
      staffId: "anna",
      dateStr: "2026-01-20",
      startAt: new Date("2026-01-20T19:30:00Z"),
    });
    expect(result).toEqual({ available: true });
  });
});

describe("findAvailableSlots — seed scenarios", () => {
  it("Tuesday Sep22 is fully booked: zero slots for any service", () => {
    for (const serviceId of ["bath_s", "groom_s", "bath_m", "groom_m"] as const) {
      const result = findAvailableSlots(repo, {
        serviceId,
        dateStr: "2026-09-22",
        now: FIXED_NOW,
      });
      expect(result.slots).toEqual([]);
      expect(result.rejected).toBeUndefined();
    }
  });

  it("Wednesday Sep23 has available slots for all services (no seeded bookings)", () => {
    for (const serviceId of ["bath_s", "groom_s", "bath_m", "groom_m"] as const) {
      const result = findAvailableSlots(repo, {
        serviceId,
        dateStr: "2026-09-23",
        now: FIXED_NOW,
      });
      expect(result.slots.length).toBeGreaterThan(0);
    }
  });

  it("Monday Sep21 (closed) returns zero slots for any service", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "groom_s",
      dateStr: "2026-09-21",
      now: FIXED_NOW,
    });
    expect(result.slots).toEqual([]);
  });

  it("caps results at MAX_OFFERS_PER_SEARCH (3) even when more slots exist", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-23",
      now: FIXED_NOW,
    });
    expect(result.slots.length).toBeLessThanOrEqual(3);
  });

  it("every returned slot is internally consistent (end = start+duration, occupiedUntil = end+15)", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "groom_s",
      dateStr: "2026-09-23",
      staffId: "anna",
      now: FIXED_NOW,
    });
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      const durationMs = slot.endAt.getTime() - slot.startAt.getTime();
      expect(durationMs).toBe(90 * 60_000);
      const bufferMs = slot.occupiedUntil.getTime() - slot.endAt.getTime();
      expect(bufferMs).toBe(15 * 60_000);
    }
  });

  it("scanning a single staff member only returns that staff's slots", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-23",
      staffId: "maria",
      now: FIXED_NOW,
    });
    for (const slot of result.slots) {
      expect(slot.staffId).toBe("maria");
    }
  });

  it("rejects a date before studio-local today (past-date policy)", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-18",
      now: FIXED_NOW, // "today" is 2026-09-19
    });
    expect(result).toEqual({ slots: [], rejected: "past_date" });
  });

  it("allows the current studio-local date (not a past date)", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-19",
      now: FIXED_NOW,
    });
    expect(result.rejected).not.toBe("past_date");
  });

  it("rejects a date beyond the 14-day booking horizon", () => {
    // FIXED_NOW is 2026-09-19; horizon end is 2026-10-03. One day beyond.
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-10-04",
      now: FIXED_NOW,
    });
    expect(result).toEqual({ slots: [], rejected: "beyond_horizon" });
  });

  it("allows a date exactly at the 14-day horizon boundary", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-10-03",
      now: FIXED_NOW,
    });
    expect(result.rejected).not.toBe("beyond_horizon");
  });

  it("rejects an impossible calendar date instead of throwing", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-13-40",
      now: FIXED_NOW,
    });
    expect(result).toEqual({ slots: [], rejected: "invalid_date" });
  });

  it("earliestLocalTime restricts results to slots starting at/after that time (after-4pm request)", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-23",
      staffId: "anna",
      earliestLocalTime: "16:00",
      now: FIXED_NOW,
    });
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.startAt.getTime()).toBeGreaterThanOrEqual(
        studioTime("2026-09-23", "16:00").getTime(),
      );
    }
  });

  it("earliestLocalTime earlier than opening has no effect (still starts at open)", () => {
    const withEarliest = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-23",
      staffId: "anna",
      earliestLocalTime: "00:00",
      now: FIXED_NOW,
    });
    const withoutEarliest = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-23",
      staffId: "anna",
      now: FIXED_NOW,
    });
    expect(withEarliest.slots).toEqual(withoutEarliest.slots);
  });

  it("still caps at MAX_OFFERS_PER_SEARCH (3) when combined with earliestLocalTime", () => {
    const result = findAvailableSlots(repo, {
      serviceId: "bath_s",
      dateStr: "2026-09-23",
      earliestLocalTime: "09:00",
      now: FIXED_NOW,
    });
    expect(result.slots.length).toBeLessThanOrEqual(3);
  });
});
