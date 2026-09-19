// GET /api/voice/session/{sessionId}
// Poll own session state only: offers + booking + handoff.
// Auth: X-Session-Capability header (per-session token kept in page memory).
// Returns camelCase; never other customers' contacts.
//
// Contract (§15): offers [{id,staffName,serviceName,startsAt,startingPriceCents}],
// booking {id,staffName,serviceName,startsAt,endsAt,quotedPriceCents,petName},
// handoff {id,status}.

import { NextRequest } from "next/server";
import { error, json } from "@/lib/server/http";
import { getSessionState, rpcHttpError } from "@/lib/server/rpc";
import { resolveSession } from "@/lib/server/session";
import { serviceAvailable } from "@/lib/server/supabase";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  if (!serviceAvailable()) {
    return error(503, "not_configured");
  }

  const { sessionId } = await ctx.params;
  const capability = req.headers.get("x-session-capability");

  const session = await resolveSession(capability);
  if (!session) {
    return error(401, "invalid_capability");
  }
  // The URL sessionId must match the capability's conversation id.
  if (session.conversationId !== sessionId) {
    return error(401, "invalid_capability");
  }

  try {
    const state = await getSessionState(session.conversationId);
    return json(200, {
      offers: state.offers ?? [],
      booking: state.booking ?? null,
      handoff: state.handoff ?? null,
    });
  } catch (e) {
    const mapped = rpcHttpError(e);
    return error(mapped.status, mapped.code, mapped.message);
  }
}
