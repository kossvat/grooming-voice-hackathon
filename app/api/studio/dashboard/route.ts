// GET /api/studio/dashboard?date=YYYY-MM-DD
// Auth: Supabase Bearer access token (from signInWithPassword).
// Returns { studio, staff, appointments, customers, pets, handoffs } in camelCase.
// 401 = login required, 403 = not a studio member, 503 = DB not available.

import { fromZonedTime } from "date-fns-tz";
import { NextRequest } from "next/server";
import { AuthError, resolveMember } from "@/lib/server/auth";
import { isValidCalendarDate } from "@/lib/server/dates";
import { error, json } from "@/lib/server/http";
import { serviceClient, serviceAvailable } from "@/lib/server/supabase";

export async function GET(req: NextRequest): Promise<Response> {
  if (!serviceAvailable()) {
    return error(503, "not_configured", "Backend/DB not configured.");
  }

  let member;
  try {
    member = await resolveMember(req.headers.get("authorization"));
  } catch (e) {
    if (e instanceof AuthError) {
      return error(e.status, e.message);
    }
    return error(503, "db_unavailable");
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !isValidCalendarDate(date)) {
    return error(400, "invalid_date", "date must be a real YYYY-MM-DD calendar date.");
  }

  const client = serviceClient();
  const studioId = member.studioId;

  // Studio timezone determines the calendar-day window for appointments.
  const { data: studioRow, error: studioErr } = await client
    .from("studios")
    .select("id, name, timezone, accept_new_sessions, accept_bookings")
    .eq("id", studioId)
    .single();

  if (studioErr || !studioRow) {
    return error(503, "db_unavailable");
  }

  const tz = studioRow.timezone ?? "America/New_York";

  // Studio-local day bounds as UTC instants. `dayStart` is studio midnight for
  // `date`; `nextStart` is studio midnight of the following day. Querying with
  // [dayStart, nextStart) makes the window agree with the displayed studio
  // calendar across DST (offsetless `YYYY-MM-DDT00:00:00` would be read as UTC
  // by PostgREST and mis-window the day).
  const dayStart = fromZonedTime(`${date}T00:00:00`, tz);
  const nextDate = addCalendarDays(date, 1);
  const nextStart = fromZonedTime(`${nextDate}T00:00:00`, tz);

  type Row<T> = T & Record<string, unknown>;

  const { data: staff, error: staffErr } = await client
    .from("staff")
    .select("id, name")
    .eq("studio_id", studioId)
    .order("name");

  const { data: appointments, error: apptErr } = await client
    .from("appointments")
    .select(
      "id, staff_id, customer_id, pet_id, service_id, starts_at, ends_at, quoted_price_cents, status, source, " +
        "customers(name, phone), pets(name), services(name)",
    )
    .eq("studio_id", studioId)
    .eq("status", "confirmed")
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", nextStart.toISOString())
    .order("starts_at");

  const { data: customers, error: custErr } = await client
    .from("customers")
    .select("id, name, phone")
    .eq("studio_id", studioId)
    .order("name");

  const { data: pets, error: petsErr } = await client
    .from("pets")
    .select("id, customer_id, name, breed, weight_kg")
    .eq("studio_id", studioId)
    .order("name");

  const { data: handoffs, error: handoffErr } = await client
    .from("handoffs")
    .select("id, reason, summary, callback_contact, status, created_at")
    .eq("studio_id", studioId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (staffErr || apptErr || custErr || petsErr || handoffErr) {
    return error(503, "db_unavailable");
  }

  const apptRows = (appointments ?? []) as unknown as Row<{
    id: string; staff_id: string; customer_id: string; pet_id: string;
    starts_at: string; ends_at: string; quoted_price_cents: number;
    status: string; source: string;
    customers: { name: string; phone: string | null } | null;
    pets: { name: string } | null;
    services: { name: string } | null;
  }>[];

  return json(200, {
    studio: {
      id: studioRow.id,
      name: studioRow.name,
      timezone: tz,
      acceptNewSessions: studioRow.accept_new_sessions,
      acceptBookings: studioRow.accept_bookings,
    },
    staff: (staff ?? []).map((s) => ({ id: s.id, name: s.name })),
    appointments: apptRows.map((a) => ({
      id: a.id,
      staffId: a.staff_id,
      customerId: a.customer_id,
      petId: a.pet_id,
      serviceName: a.services?.name ?? "",
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      quotedPriceCents: a.quoted_price_cents,
      status: a.status,
      source: a.source,
      customerName: a.customers?.name ?? "",
      customerPhone: a.customers?.phone ?? "",
      petName: a.pets?.name ?? "",
    })),
    customers: (customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    pets: (pets ?? []).map((p) => ({
      id: p.id,
      customerId: p.customer_id,
      name: p.name,
      breed: p.breed,
      weightKg: p.weight_kg,
    })),
    handoffs: (handoffs ?? []).map((h) => ({
      id: h.id,
      reason: h.reason,
      summary: h.summary,
      callbackContact: h.callback_contact,
      status: h.status,
      createdAt: h.created_at,
    })),
  });
}

/** "YYYY-MM-DD" + n calendar days, using UTC date arithmetic (no elapsed-hours
 *  drift): parse as UTC midnight, addUTCDate(n), format back. Correct across
 *  DST transitions — fall-back still yields the next calendar date, not 23:00
 *  of the same date. */
function addCalendarDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
