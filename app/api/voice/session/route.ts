// POST /api/voice/session
// Creates a voice session: mints an ElevenLabs single-use signed URL, prebinds the
// provider conversation_id on our conversation row, and returns the session
// capability for the browser page (kept in memory only).
//
// Contract (system-design.md §15):
//   request  { demoCode }
//   response { signedUrl, conversationId, sessionId, sessionCapability }

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkDemoCode } from "@/lib/server/demo-gate";
import { generateSessionCapability, hashSessionCapability } from "@/lib/server/crypto";
import { fetchSignedConversation } from "@/lib/server/elevenlabs";
import { requireEnv, studioId } from "@/lib/server/env";
import { error, json } from "@/lib/server/http";
import { createConversation } from "@/lib/server/rpc";
import { serviceAvailable } from "@/lib/server/supabase";

const BodySchema = z.object({
  demoCode: z.string().optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  if (!serviceAvailable()) {
    return error(503, "not_configured", "Backend/DB not configured.");
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return error(400, "invalid_request");
  }

  const gate = checkDemoCode({ demoCode: body.demoCode ?? null });
  if (!gate.ok) {
    return error(gate.status, gate.code, gate.message);
  }

  // Studio must be accepting new sessions (double-checked inside RPC too).
  let token: Awaited<ReturnType<typeof fetchSignedConversation>>;
  try {
    token = await fetchSignedConversation(requireEnv("ELEVENLABS_AGENT_ID"), requireEnv("ELEVENLABS_API_KEY"));
  } catch (e) {
    return error(502, "elevenlabs_unavailable", e instanceof Error ? e.message : undefined);
  }

  const capability = generateSessionCapability();
  const capabilityHash = hashSessionCapability(capability, requireEnv("SESSION_CAPABILITY_SECRET"));

  let conversation;
  try {
    conversation = await createConversation({
      studioId: studioId(),
      providerConversationId: token.conversationId,
      sessionCapabilityHash: capabilityHash,
    });
  } catch (e) {
    return error(503, "session_create_failed", e instanceof Error ? e.message : undefined);
  }

  return json(200, {
    signedUrl: token.signedUrl,
    conversationId: token.conversationId,
    sessionId: conversation.id,
    sessionCapability: capability,
  });
}
