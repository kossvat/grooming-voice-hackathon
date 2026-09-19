// Shared guards for the four ElevenLabs webhook tool routes.
// Each route must pass ALL of:
//   1. static tool secret (WEBHOOK_TOOL_SECRET) — proves the call came from
//      our configured agent, not a random internet client;
//   2. a valid session capability (X-Session-Capability or dynamic variable)
//      mapping to an active conversation;
//   3. provider-conversation binding: the REQUIRED x-provider-conversation-id
//      header (set by ElevenLabs, not the LLM) must match the id prebound at
//      session creation.

import { NextRequest } from "next/server";
import { error } from "./http";
import { resolveSession, verifyToolSecret } from "./session";
import type { SessionContext } from "./session";

export interface ToolAuthOk {
  session: SessionContext;
}

export type ToolAuthResult =
  | { ok: true; value: ToolAuthOk }
  | { ok: false; response: Response };

/** Static tool secret from the x-webhook-tool-secret header. */
export function toolSecret(req: NextRequest): string | null {
  return req.headers.get("x-webhook-tool-secret");
}

/** Session capability: header first, then dynamic variable fallback. */
export async function toolCapability(req: NextRequest, body: Record<string, unknown> | null): Promise<string | null> {
  const header = req.headers.get("x-session-capability");
  if (header) return header;
  const dv = body?.["secret__session_capability"];
  if (typeof dv === "string" && dv) return dv;
  return null;
}

export async function authorizeTool(
  req: NextRequest,
  body: Record<string, unknown> | null,
): Promise<ToolAuthResult> {
  if (!verifyToolSecret(toolSecret(req))) {
    return { ok: false, response: error(401, "invalid_tool_secret") };
  }

  // REQUIRED provider conversation id, from the configured header (provider-
  // injected), never from the LLM-authored body. Absence is a rejection.
  const providerConversationId = req.headers.get("x-provider-conversation-id");
  if (!providerConversationId || providerConversationId.length === 0) {
    return { ok: false, response: error(401, "missing_provider_conversation_id") };
  }

  const capability = await toolCapability(req, body);
  const session = await resolveSession(capability);
  if (!session) {
    return { ok: false, response: error(401, "invalid_capability") };
  }

  // Must match the id prebound at session creation.
  if (providerConversationId !== session.providerConversationId) {
    return { ok: false, response: error(401, "provider_conversation_mismatch") };
  }

  return { ok: true, value: { session } };
}
