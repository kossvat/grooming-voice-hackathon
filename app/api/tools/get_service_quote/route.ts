// POST /api/tools/get_service_quote
// Server-authoritative starting price. Never trusts a caller-supplied amount.
// On a handoff result, persists a staff task via create_handoff BEFORE
// reporting the follow-up to the agent (followUpPersisted becomes true).

import { NextRequest } from "next/server";
import { z } from "zod";
import { getServiceQuote, type ServiceFamily } from "@/lib/domain/quote";
import { error, json } from "@/lib/server/http";
import { createHandoff } from "@/lib/server/rpc";
import { serviceAvailable } from "@/lib/server/supabase";
import { authorizeTool } from "@/lib/server/tool-auth";
import { logToolCall, newRequestId } from "@/lib/server/tool-log";

const BodySchema = z.object({
  family: z.enum(["bath", "full_groom"]),
  weight: z.object({
    value: z.number(),
    unit: z.string(),
  }),
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
    await logToolCall({ requestId, conversationId: auth.value.session.conversationId, toolName: "get_service_quote", startedAt, outcome: "error", redactedSummary: "validation_failed" });
    return error(400, "invalid_request");
  }

  const quote = getServiceQuote({
    family: body.data.family as ServiceFamily,
    weight: { value: body.data.weight.value, unit: body.data.weight.unit },
  });

  if (quote.status === "handoff") {
    // Persist the staff task, then flip the contract flag.
    let persisted = false;
    let handoffId: string | null = null;
    try {
      const h = await createHandoff({
        conversationId: auth.value.session.conversationId,
        reason: quote.reason,
        summary: `quote handoff: family=${body.data.family}`,
      });
      persisted = h.persisted;
      handoffId = h.id;
    } catch {
      persisted = false;
    }

    // Truthful copy: only claim a follow-up was arranged when it actually
    // persisted. On failure, do not promise a callback that was never saved.
    const spokenAnswer = persisted
      ? quote.spokenAnswer
      : "I can't reach the team right now — please call the studio directly and we'll sort this out.";

    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "get_service_quote",
      startedAt,
      outcome: "handoff",
      redactedSummary: `reason=${quote.reason}`,
    });

    return json(200, {
      result: {
        status: "handoff",
        reason: quote.reason,
        spokenAnswer,
        followUpPersisted: persisted,
        ...(handoffId ? { handoffId } : {}),
      },
    });
  }

  await logToolCall({
    requestId,
    conversationId: auth.value.session.conversationId,
    toolName: "get_service_quote",
    startedAt,
    outcome: "ok",
    redactedSummary: `service=${quote.serviceId}`,
  });

  return json(200, {
    result: {
      status: "ok",
      serviceId: quote.serviceId,
      sizeCode: quote.sizeCode,
      startingPriceCents: quote.startingPriceCents,
      currency: quote.currency,
      durationMinutes: quote.durationMinutes,
      bufferMinutes: quote.bufferMinutes,
      normalizedWeightKg: quote.normalizedWeightKg,
      spokenAnswer: quote.spokenAnswer,
    },
  });
}
