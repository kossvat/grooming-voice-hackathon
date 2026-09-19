// POST /api/tools/create_booking
// Commits a booking from a persisted offer id (idempotent — a retry after
// offer expiry returns the committed result). Revalidates price/schedule/pet
// at commit inside the RPC.
//
// The agent must read the booking back to the caller and obtain an explicit
// confirmation before calling this tool; `customerConfirmed: true` is the
// hard schema gate for that contract.

import { NextRequest } from "next/server";
import { z } from "zod";
import { error, json } from "@/lib/server/http";
import { createBooking, rpcHttpError } from "@/lib/server/rpc";
import { serviceAvailable } from "@/lib/server/supabase";
import { authorizeTool } from "@/lib/server/tool-auth";
import { logToolCall, newRequestId } from "@/lib/server/tool-log";

const BodySchema = z.object({
  offerId: z.string().uuid(),
  customerConfirmed: z.literal(true),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().min(1).max(40),
  petName: z.string().min(1).max(200),
  petSpecies: z.string().optional(),
  petBreed: z.string().max(200).optional(),
  // Required: the RPC hard-requires it; the agent has it from the quote/search.
  petWeightKg: z.number().positive(),
  petNotes: z.string().max(1000).optional(),
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
    await logToolCall({ requestId, conversationId: auth.value.session.conversationId, toolName: "create_booking", startedAt, outcome: "error", redactedSummary: "validation_failed" });
    return error(400, "invalid_request");
  }

  try {
    const booking = await createBooking({
      conversationId: auth.value.session.conversationId,
      offerId: body.data.offerId,
      customerName: body.data.customerName,
      customerPhone: body.data.customerPhone,
      petName: body.data.petName,
      petSpecies: body.data.petSpecies ?? "dog",
      petBreed: body.data.petBreed ?? null,
      petWeightKg: body.data.petWeightKg,
      petNotes: body.data.petNotes ?? null,
    });

    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "create_booking",
      startedAt,
      outcome: "ok",
      redactedSummary: `booking=${booking.id} idempotent=${booking.idempotent}`,
    });

    return json(200, {
      result: {
        status: "confirmed",
        ...booking,
      },
    });
  } catch (e) {
    const mapped = rpcHttpError(e);
    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "create_booking",
      startedAt,
      outcome: "error",
      redactedSummary: mapped.code,
    });
    return error(mapped.status, mapped.code, mapped.message);
  }
}
