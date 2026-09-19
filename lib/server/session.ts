// Session capability resolution: the HTTP layer maps a capability token to a
// conversation row by its stored HMAC, verifying it timing-safely against the
// static SESSION_CAPABILITY_SECRET. No RPC trusts a caller-supplied studio_id.

import { requireEnv } from "./env";
import { hashSessionCapability, verifyStaticSecret } from "./crypto";
import { serviceClient } from "./supabase";

export interface SessionContext {
  conversationId: string;
  studioId: string;
  providerConversationId: string;
}

/**
 * Resolve a raw capability token to an active conversation.
 * Returns null when unknown/expired/foreign. Never throws for a bad token.
 */
export async function resolveSession(capability: string | null): Promise<SessionContext | null> {
  if (!capability) return null;
  const secret = requireEnv("SESSION_CAPABILITY_SECRET");
  const hash = hashSessionCapability(capability, secret);

  const client = serviceClient();
  const { data, error } = await client
    .from("conversations")
    .select("id, studio_id, provider_conversation_id, status, expires_at, session_capability_expires_at")
    .eq("session_capability_hash", hash)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const c = data[0];
  const now = new Date();
  if (c.status !== "active") return null;
  if (new Date(c.expires_at) <= now) return null;
  if (new Date(c.session_capability_expires_at) <= now) return null;

  return {
    conversationId: c.id,
    studioId: c.studio_id,
    providerConversationId: c.provider_conversation_id,
  };
}

/** Verify the static webhook tool secret (shared with the ElevenLabs agent). */
export function verifyToolSecret(candidate: string | null): boolean {
  if (!candidate) return false;
  const expected = requireEnv("WEBHOOK_TOOL_SECRET");
  return verifyStaticSecret(candidate, expected);
}
