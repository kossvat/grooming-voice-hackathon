// POST /api/tools/create_handoff
// Persists a staff follow-up task (deduplicated by conversation + reason).

import { NextRequest } from "next/server";
import { z } from "zod";
import { error, json } from "@/lib/server/http";
import { createHandoff, rpcHttpError } from "@/lib/server/rpc";
import { serviceAvailable } from "@/lib/server/supabase";
import { authorizeTool } from "@/lib/server/tool-auth";
import { logToolCall, newRequestId } from "@/lib/server/tool-log";

const BodySchema = z.object({
  reason: z.string().min(1).max(100),
  summary: z.string().max(2000).optional(),
  callbackContact: z.string().max(40).optional(),
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
    await logToolCall({ requestId, conversationId: auth.value.session.conversationId, toolName: "create_handoff", startedAt, outcome: "error", redactedSummary: "validation_failed" });
    return error(400, "invalid_request");
  }

  try {
    const handoff = await createHandoff({
      conversationId: auth.value.session.conversationId,
      reason: body.data.reason,
      summary: body.data.summary ?? null,
      callbackContact: body.data.callbackContact ?? null,
    });

    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "create_handoff",
      startedAt,
      outcome: "ok",
      redactedSummary: `reason=${handoff.reason} id=${handoff.id}`,
    });

    return json(200, {
      result: {
        status: "persisted",
        id: handoff.id,
        reason: handoff.reason,
      },
    });
  } catch (e) {
    const mapped = rpcHttpError(e);
    await logToolCall({
      requestId,
      conversationId: auth.value.session.conversationId,
      toolName: "create_handoff",
      startedAt,
      outcome: "error",
      redactedSummary: mapped.code,
    });
    return error(mapped.status, mapped.code, mapped.message);
  }
}
