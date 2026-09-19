// check_availability: server-authoritative slot search.
//
// Persistence is explicit and injected via AvailabilityRepository so this
// module has no direct database dependency. The seed-backed implementation
// below (SeedAvailabilityRepository) is what today's unit tests exercise;
// it is NOT proof of Postgres-level concurrency safety (range-exclusion
// constraints, row locks, generations under real concurrent writers). A
// Supabase-backed repository implementing the same interface, plus explicit
// concurrency tests against real Postgres, is deferred to the next milestone.

import {
  BOOKING_HORIZON_DAYS,
  CLEANUP_BUFFER_MINUTES,
  MAX_OFFERS_PER_SEARCH,
  SEED_APPOINTMENTS,
  SEED_BLOCKS,
  SERVICES,
  SLOT_STEP_MINUTES,
  STAFF,
  WEEKLY_HOURS,
  type ServiceId,
  type StaffId,
} from "./seed-data";
import {
  addMinutes,
  dateStrFromInstant,
  dateStrFromIso,
  intervalsOverlap,
  isValidCalendarDateStr,
  studioDateTime,
  weekdayOfDate,
} from "./time";

export interface OccupiedInterval {
  /** Studio-local start instant. */
  startAt: Date;
  /** Studio-local end-of-occupation instant (service end + cleanup buffer). */
  occupiedUntil: Date;
}

/** Explicit persistence seam. Swap for a Supabase-backed implementation later. */
export interface AvailabilityRepository {
  getOccupiedIntervals(staffId: StaffId, dateStr: string): OccupiedInterval[];
}

/** Seed-backed repository used by tests and the pre-database demo path. */
export class SeedAvailabilityRepository implements AvailabilityRepository {
  getOccupiedIntervals(staffId: StaffId, dateStr: string): OccupiedInterval[] {
    const appts = SEED_APPOINTMENTS.filter(
      (a) => a.staffId === staffId && dateStrFromIso(a.startAt) === dateStr,
    ).map((a) => ({
      startAt: new Date(a.startAt),
      occupiedUntil: new Date(a.occupiedUntil),
    }));

    const blocks = SEED_BLOCKS.filter(
      (b) => b.staffId === staffId && dateStrFromIso(b.startAt) === dateStr,
    ).map((b) => ({
      startAt: new Date(b.startAt),
      occupiedUntil: new Date(b.endAt),
    }));

    return [...appts, ...blocks];
  }
}

export type UnavailableReason =
  | "closed_day"
  | "outside_hours"
  | "overlaps_break"
  | "overlaps_block_or_appointment"
  | "unknown_staff_or_service"
  | "invalid_request";

export type AvailabilityCheckResult =
  | { available: true }
  | { available: false; reason: UnavailableReason };

/**
 * Checks one candidate start time for one staff/service pair.
 * Requires the FULL service duration plus the cleanup buffer to fit inside
 * staff hours, avoiding lunch, one-off blocks and other appointments.
 * Fails CLOSED (returns available:false, never throws to the caller) on any
 * malformed/impossible date, time-of-day or Invalid Date input.
 */
export function checkAvailability(
  repo: AvailabilityRepository,
  params: { serviceId: ServiceId; staffId: StaffId; dateStr: string; startAt: Date },
): AvailabilityCheckResult {
  const service = SERVICES[params.serviceId];
  const staff = STAFF[params.staffId];
  if (!service || !staff || !staff.serviceIds.includes(params.serviceId)) {
    return { available: false, reason: "unknown_staff_or_service" };
  }

  if (Number.isNaN(params.startAt.getTime()) || !isValidCalendarDateStr(params.dateStr)) {
    return { available: false, reason: "invalid_request" };
  }

  try {
    const dateStr = params.dateStr;
    const weekday = weekdayOfDate(dateStr);
    const hours = WEEKLY_HOURS.find((h) => h.weekday === weekday);
    if (!hours || hours.closed) {
      return { available: false, reason: "closed_day" };
    }

    const openAt = studioDateTime(dateStr, hours.open!);
    const closeAt = studioDateTime(dateStr, hours.close!);

    const endAt = addMinutes(params.startAt, service.durationMinutes);
    const occupiedUntil = addMinutes(endAt, CLEANUP_BUFFER_MINUTES);

    if (params.startAt.getTime() < openAt.getTime() || occupiedUntil.getTime() > closeAt.getTime()) {
      return { available: false, reason: "outside_hours" };
    }

    const breakStart = studioDateTime(dateStr, staff.dailyBreak.start);
    const breakEnd = studioDateTime(dateStr, staff.dailyBreak.end);
    if (intervalsOverlap(params.startAt, occupiedUntil, breakStart, breakEnd)) {
      return { available: false, reason: "overlaps_break" };
    }

    const occupied = repo.getOccupiedIntervals(params.staffId, dateStr);
    for (const interval of occupied) {
      if (intervalsOverlap(params.startAt, occupiedUntil, interval.startAt, interval.occupiedUntil)) {
        return { available: false, reason: "overlaps_block_or_appointment" };
      }
    }

    return { available: true };
  } catch {
    // Any invalid_calendar_date/invalid_instant thrown by lib/domain/time.ts
    // fails closed here rather than propagating or (worse) letting a NaN
    // comparison silently report available:true.
    return { available: false, reason: "invalid_request" };
  }
}

export interface AvailableSlot {
  serviceId: ServiceId;
  staffId: StaffId;
  startAt: Date;
  endAt: Date;
  occupiedUntil: Date;
  startingPriceCents: number;
  currency: "USD";
}

export type SlotSearchRejection =
  | "invalid_date"
  | "past_date"
  | "beyond_horizon"
  | "invalid_earliest_time";

export interface FindAvailableSlotsResult {
  slots: AvailableSlot[];
  rejected?: SlotSearchRejection;
}

/**
 * Finds up to MAX_OFFERS_PER_SEARCH available slots for a service on a date,
 * scanning every SLOT_STEP_MINUTES step across studio hours. If staffId is
 * omitted, scans both staff members in id order and returns the first slots
 * found across either of them (still capped at MAX_OFFERS_PER_SEARCH).
 *
 * Enforces the studio's booking policy at the boundary: rejects a date that
 * is not a real calendar date, is in the past (studio-local "today"), or is
 * beyond BOOKING_HORIZON_DAYS. `now` is injectable for deterministic tests;
 * defaults to the real current instant.
 *
 * `earliestLocalTime` ("HH:mm") lets a caller who asked "anything after
 * 4pm" get relevant slots instead of always starting the scan at opening.
 */
export function findAvailableSlots(
  repo: AvailabilityRepository,
  params: {
    serviceId: ServiceId;
    dateStr: string;
    staffId?: StaffId;
    earliestLocalTime?: string;
    now?: Date;
  },
): FindAvailableSlotsResult {
  const service = SERVICES[params.serviceId];
  if (!service) return { slots: [] };

  if (!isValidCalendarDateStr(params.dateStr)) {
    return { slots: [], rejected: "invalid_date" };
  }

  const now = params.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    return { slots: [], rejected: "invalid_date" };
  }
  const todayStr = dateStrFromInstant(now);
  if (params.dateStr < todayStr) {
    return { slots: [], rejected: "past_date" };
  }
  const horizonEnd = dateStrFromInstant(addMinutes(now, BOOKING_HORIZON_DAYS * 24 * 60));
  if (params.dateStr > horizonEnd) {
    return { slots: [], rejected: "beyond_horizon" };
  }

  const weekday = weekdayOfDate(params.dateStr);
  const hours = WEEKLY_HOURS.find((h) => h.weekday === weekday);
  if (!hours || hours.closed) return { slots: [] };

  let openAt: Date;
  let closeAt: Date;
  try {
    openAt = studioDateTime(params.dateStr, hours.open!);
    closeAt = studioDateTime(params.dateStr, hours.close!);
    if (params.earliestLocalTime) {
      const earliestAt = studioDateTime(params.dateStr, params.earliestLocalTime);
      if (earliestAt.getTime() > openAt.getTime()) {
        openAt = earliestAt;
      }
    }
  } catch {
    return { slots: [], rejected: "invalid_earliest_time" };
  }

  const staffIds: StaffId[] = params.staffId
    ? [params.staffId]
    : (Object.keys(STAFF) as StaffId[]);

  const results: AvailableSlot[] = [];

  for (const staffId of staffIds) {
    if (!STAFF[staffId].serviceIds.includes(params.serviceId)) continue;

    for (
      let candidate = openAt;
      candidate.getTime() <= closeAt.getTime();
      candidate = addMinutes(candidate, SLOT_STEP_MINUTES)
    ) {
      const check = checkAvailability(repo, {
        serviceId: params.serviceId,
        staffId,
        dateStr: params.dateStr,
        startAt: candidate,
      });
      if (check.available) {
        const endAt = addMinutes(candidate, service.durationMinutes);
        results.push({
          serviceId: params.serviceId,
          staffId,
          startAt: new Date(candidate),
          endAt,
          occupiedUntil: addMinutes(endAt, CLEANUP_BUFFER_MINUTES),
          startingPriceCents: service.startingPriceCents,
          currency: service.currency,
        });
      }
      if (results.length >= MAX_OFFERS_PER_SEARCH) return { slots: results };
    }
  }

  return { slots: results };
}
