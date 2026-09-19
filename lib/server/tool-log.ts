// Server-side tool-call logging. Request IDs and redacted summaries only —
// never credentials, tokens, or full customer contact details.

import { randomUUID } from "node:crypto";
import { serviceClient } from "./supabase";

export function newRequestId(): string {
  return randomUUID();
}

export async function logToolCall(params: {
  requestId: string;
  conversationId: string | null;
  toolName: string;
  startedAt: Date;
  outcome: "ok" | "error" | "handoff";
  redactedSummary?: string;
}): Promise<void> {
  try {
    const client = serviceClient();
    const durationMs = Date.now() - params.startedAt.getTime();
    await client.from("tool_calls").insert({
      request_id: params.requestId,
      conversation_id: params.conversationId,
      tool_name: params.toolName,
      started_at: params.startedAt.toISOString(),
      duration_ms: durationMs,
      outcome: params.outcome,
      redacted_summary: params.redactedSummary ?? null,
    });
  } catch {
    // Logging must never fail the tool call itself.
  }
}
