// POST /api/tools/find_available_slots
// Returns up to 3 slots (each carrying its persisted offer id) for a service
// and date, binding pet weight/species into the offers. Reasons are stable
// strings the agent can map to speech.

import { NextRequest } from "next/server";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { STUDIO_TIMEZONE } from "@/lib/domain/time";
import { isValidCalendarDate, isValidTimeOfDay } from "@/lib/server/dates";
import { error, json } from "@/lib/server/http";
import { findAvailableSlots, rpcHttpError } from "@/lib/server/rpc";
import { serviceAvailable } from "@/lib/server/supabase";
import { authorizeTool } from "@/lib/server/tool-auth";
import { logToolCall, newRequestId } from "@/lib/server/tool-log";

const BodySchema = z.object({
  serviceId: z.string().min(1).max(100),
  date: z.string().refine(isValidCalendarDate, "invalid_date"),
  earliestTime: z.string().refine(isValidTimeOfDay, "invalid_time").optional(),
  petWeightKg: z.number().positive().nullable().optional(),
  petSpecies: z.string().optional(),
  // Requested groomer. The MVP does not honor a specific-groomer preference,
  // so we surface it explicitly (never silently ignore it) for the agent.
  staffId: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const startedAt = new Date();
  const requestId = newRequestId();

  if (!serviceAvailable()) {
    return error(503, "not_configured");
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return error(400, "invalid_request");
  }

  const auth = await authorizeTool(req, raw as Record<string, unknown> | null);
  if (!auth.ok) return auth.response;

  const body = BodySchema.safeParse(raw);
  if (!body.success) {
    await logToolCall({ requestId, conversationId: auth.value.session.conversationId, toolName: "find_available_slots", startedAt, outcome: "error", redactedSummary: "validation_failed" });
    return error(400, "invalid_request");
  }

  // Explicit staff-preference rejection: a specific-groomer request is not
  // supported in the MVP, so the agent must be told clearly rather than have
  // the preference dropped.
  if (body.data.staffId) {
    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "find_available_slots",
      startedAt,
      outcome: "ok",
      redactedSummary: `staff_preference_unsupported staff=${body.data.staffId}`,
    });
    return json(200, {
      result: { slots: [], generation: 0, reason: "staff_preference_unsupported" },
    });
  }

  try {
    const result = await findAvailableSlots({
      conversationId: auth.value.session.conversationId,
      serviceId: body.data.serviceId,
      dateStr: body.data.date,
      earliestTime: body.data.earliestTime ?? null,
      petWeightKg: body.data.petWeightKg ?? null,
      petSpecies: body.data.petSpecies ?? "dog",
    });

    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "find_available_slots",
      startedAt,
      outcome: "ok",
      redactedSummary: `service=${body.data.serviceId} date=${body.data.date} slots=${result.slots.length}`,
    });

    return json(200, {
      result: {
        timezone: STUDIO_TIMEZONE,
        slots: result.slots.map((slot) => ({
          ...slot,
          startsAtLocal: formatInTimeZone(slot.startsAt, STUDIO_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          spokenStart: formatInTimeZone(slot.startsAt, STUDIO_TIMEZONE, "EEEE, MMMM d, yyyy 'at' h:mm a zzz"),
        })),
        generation: result.generation,
        ...(result.reason ? { reason: result.reason } : {}),
      },
    });
  } catch (e) {
    const mapped = rpcHttpError(e);
    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "find_available_slots",
      startedAt,
      outcome: "error",
      redactedSummary: mapped.code,
    });
    return error(mapped.status, mapped.code, mapped.message);
  }
}
