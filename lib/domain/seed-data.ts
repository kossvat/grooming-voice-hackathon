// Static seed data used by the demo domain layer (quotes/availability).
// Mirrors docs/mel-grooming-2026-09-19/demo-data.json exactly for the
// fields the domain logic needs. Fictional studio; not a live salon.

export type ServiceId = "bath_s" | "groom_s" | "bath_m" | "groom_m";
export type SizeCode = "S" | "M";
export type StaffId = "anna" | "maria";

export interface ServiceDef {
  id: ServiceId;
  family: "bath" | "full_groom";
  name: string;
  size: SizeCode;
  startingPriceCents: number;
  currency: "USD";
  durationMinutes: number;
  bufferMinutes: number;
}

export interface StaffDef {
  id: StaffId;
  displayName: string;
  serviceIds: ServiceId[];
  dailyBreak: { start: string; end: string }; // "HH:mm" studio-local
}

export interface WeeklyHours {
  weekday:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  closed?: true;
  open?: string; // "HH:mm"
  close?: string; // "HH:mm"
}

export interface SizePolicyRange {
  code: SizeCode;
  minExclusiveKg: number;
  maxInclusiveKg: number;
}

export const STUDIO_TIMEZONE = "America/New_York";
export const SLOT_STEP_MINUTES = 15;
export const CLEANUP_BUFFER_MINUTES = 15;
export const MAX_OFFERS_PER_SEARCH = 3;
export const BOOKING_HORIZON_DAYS = 14;

export const SIZE_POLICY: SizePolicyRange[] = [
  { code: "S", minExclusiveKg: 0, maxInclusiveKg: 10 },
  { code: "M", minExclusiveKg: 10, maxInclusiveKg: 20 },
];

export const SERVICES: Record<ServiceId, ServiceDef> = {
  bath_s: {
    id: "bath_s",
    family: "bath",
    name: "Bath & Brush — Small",
    size: "S",
    startingPriceCents: 6500,
    currency: "USD",
    durationMinutes: 60,
    bufferMinutes: 15,
  },
  groom_s: {
    id: "groom_s",
    family: "full_groom",
    name: "Full Groom — Small",
    size: "S",
    startingPriceCents: 8000,
    currency: "USD",
    durationMinutes: 90,
    bufferMinutes: 15,
  },
  bath_m: {
    id: "bath_m",
    family: "bath",
    name: "Bath & Brush — Medium",
    size: "M",
    startingPriceCents: 8000,
    currency: "USD",
    durationMinutes: 75,
    bufferMinutes: 15,
  },
  groom_m: {
    id: "groom_m",
    family: "full_groom",
    name: "Full Groom — Medium",
    size: "M",
    startingPriceCents: 10000,
    currency: "USD",
    durationMinutes: 120,
    bufferMinutes: 15,
  },
};

export const STAFF: Record<StaffId, StaffDef> = {
  anna: {
    id: "anna",
    displayName: "Anna",
    serviceIds: ["bath_s", "groom_s", "bath_m", "groom_m"],
    dailyBreak: { start: "13:00", end: "14:00" },
  },
  maria: {
    id: "maria",
    displayName: "Maria",
    serviceIds: ["bath_s", "groom_s", "bath_m", "groom_m"],
    dailyBreak: { start: "13:00", end: "14:00" },
  },
};

export const WEEKLY_HOURS: WeeklyHours[] = [
  { weekday: "monday", closed: true },
  { weekday: "tuesday", open: "09:00", close: "18:00" },
  { weekday: "wednesday", open: "09:00", close: "18:00" },
  { weekday: "thursday", open: "09:00", close: "18:00" },
  { weekday: "friday", open: "09:00", close: "18:00" },
  { weekday: "saturday", open: "09:00", close: "18:00" },
  { weekday: "sunday", open: "10:00", close: "18:00" },
];

/** Seeded confirmed appointments (subset of demo-data.json used by availability tests). */
export interface SeedAppointment {
  id: string;
  staffId: StaffId;
  serviceId: ServiceId;
  /** ISO instant with the studio's -04:00 offset, matching the seed file. */
  startAt: string;
  endAt: string;
  occupiedUntil: string;
}

export const SEED_APPOINTMENTS: SeedAppointment[] = [
  {
    id: "booking_seed_1",
    staffId: "anna",
    serviceId: "groom_s",
    startAt: "2026-09-20T10:00:00-04:00",
    endAt: "2026-09-20T11:30:00-04:00",
    occupiedUntil: "2026-09-20T11:45:00-04:00",
  },
  {
    id: "booking_seed_2",
    staffId: "maria",
    serviceId: "bath_m",
    startAt: "2026-09-20T11:30:00-04:00",
    endAt: "2026-09-20T12:45:00-04:00",
    occupiedUntil: "2026-09-20T13:00:00-04:00",
  },
  {
    id: "booking_seed_3",
    staffId: "anna",
    serviceId: "groom_s",
    startAt: "2026-09-22T09:00:00-04:00",
    endAt: "2026-09-22T10:30:00-04:00",
    occupiedUntil: "2026-09-22T10:45:00-04:00",
  },
  {
    id: "booking_seed_4",
    staffId: "maria",
    serviceId: "bath_s",
    startAt: "2026-09-22T09:00:00-04:00",
    endAt: "2026-09-22T10:00:00-04:00",
    occupiedUntil: "2026-09-22T10:15:00-04:00",
  },
  {
    id: "booking_seed_5",
    staffId: "anna",
    serviceId: "bath_m",
    startAt: "2026-09-22T11:00:00-04:00",
    endAt: "2026-09-22T12:15:00-04:00",
    occupiedUntil: "2026-09-22T12:30:00-04:00",
  },
  {
    id: "booking_seed_6",
    staffId: "maria",
    serviceId: "groom_m",
    startAt: "2026-09-22T14:00:00-04:00",
    endAt: "2026-09-22T16:00:00-04:00",
    occupiedUntil: "2026-09-22T16:15:00-04:00",
  },
  {
    id: "booking_seed_7",
    staffId: "anna",
    serviceId: "groom_m",
    startAt: "2026-09-22T14:00:00-04:00",
    endAt: "2026-09-22T16:00:00-04:00",
    occupiedUntil: "2026-09-22T16:15:00-04:00",
  },
  {
    id: "booking_seed_8",
    staffId: "anna",
    serviceId: "bath_s",
    startAt: "2026-09-22T16:30:00-04:00",
    endAt: "2026-09-22T17:30:00-04:00",
    occupiedUntil: "2026-09-22T17:45:00-04:00",
  },
  {
    id: "booking_seed_9",
    staffId: "maria",
    serviceId: "groom_m",
    startAt: "2026-09-22T10:30:00-04:00",
    endAt: "2026-09-22T12:30:00-04:00",
    occupiedUntil: "2026-09-22T12:45:00-04:00",
  },
  {
    id: "booking_seed_10",
    staffId: "maria",
    serviceId: "bath_s",
    startAt: "2026-09-22T16:30:00-04:00",
    endAt: "2026-09-22T17:30:00-04:00",
    occupiedUntil: "2026-09-22T17:45:00-04:00",
  },
];

/** One-off schedule block from demo-data.json's date_blocks. */
export interface SeedBlock {
  staffId: StaffId;
  startAt: string;
  endAt: string;
  reason: string;
}

export const SEED_BLOCKS: SeedBlock[] = [
  {
    staffId: "anna",
    startAt: "2026-09-20T12:00:00-04:00",
    endAt: "2026-09-20T13:00:00-04:00",
    reason: "Synthetic staff block",
  },
];
