// Typed wrappers over the service_role RPCs (db/002_functions.sql).
// These are the ONLY paths that mutate offers/appointments/handoffs.

import { serviceClient } from "./supabase";

export class RpcError extends Error {
  constructor(
    message: string,
    public readonly sqlstate?: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/**
 * Map a Supabase/PostgREST error to a stable RpcError. The PostgREST error
 * shape carries `code` (SQLSTATE) and `message`. We preserve the SQLSTATE and
 * extract the RPC's own raised-exception token (P0001) where present.
 */
function rpcErrorFrom(err: unknown): RpcError {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown; hint?: unknown };
    const code = typeof e.code === "string" ? e.code : undefined;
    const message = typeof e.message === "string" ? e.message : "rpc_failed";
    const hint = typeof e.hint === "string" ? e.hint : undefined;

    if (code === "P0001") {
      // Our own `raise exception 'token'` — the token is the last word of the message.
      const m = message.match(/([a-z_]{3,60})/i);
      return new RpcError(m ? m[1] : "rpc_raised", code, hint ?? message);
    }
    return new RpcError(message, code, hint);
  }
  return new RpcError("rpc_failed");
}

async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const client = serviceClient();
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    throw rpcErrorFrom(error);
  }
  return data as T;
}

export interface ConversationRow {
  id: string;
  studioId: string;
  capabilityHash: string;
  searchGeneration: number;
  expiresAt: string;
}

export function createConversation(params: {
  studioId: string;
  providerConversationId: string;
  sessionCapabilityHash: string;
  sessionCapabilityTtlMinutes?: number;
  ttlMinutes?: number;
}): Promise<ConversationRow> {
  return callRpc<ConversationRow>("create_conversation", {
    p_studio_id: params.studioId,
    p_provider_conversation_id: params.providerConversationId,
    p_session_capability_hash: params.sessionCapabilityHash,
    p_session_capability_ttl_minutes: params.sessionCapabilityTtlMinutes ?? 30,
    p_ttl_minutes: params.ttlMinutes ?? 60,
  });
}

export interface Slot {
  offerId: string;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
  startingPriceCents: number;
  currency: string;
}

export interface SlotSearchResult {
  slots: Slot[];
  generation: number;
  reason?: string;
}

export function findAvailableSlots(params: {
  conversationId: string;
  serviceId: string;
  dateStr: string;
  earliestTime?: string | null;
  petWeightKg?: number | null;
  petSpecies?: string | null;
}): Promise<SlotSearchResult> {
  return callRpc<SlotSearchResult>("find_available_slots", {
    p_conversation_id: params.conversationId,
    p_service_id: params.serviceId,
    p_date_str: params.dateStr,
    p_earliest_time: params.earliestTime ?? null,
    p_pet_weight_kg: params.petWeightKg ?? null,
    p_pet_species: params.petSpecies ?? "dog",
  });
}

export interface BookingResult {
  idempotent: boolean;
  id: string;
  staffName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  quotedPriceCents: number;
  petName: string;
  source: string;
}

export function createBooking(params: {
  conversationId: string;
  offerId: string;
  customerName: string;
  customerPhone: string;
  petName: string;
  petSpecies?: string | null;
  petBreed?: string | null;
  petWeightKg?: number | null;
  petNotes?: string | null;
}): Promise<BookingResult> {
  return callRpc<BookingResult>("create_booking", {
    p_conversation_id: params.conversationId,
    p_offer_id: params.offerId,
    p_customer_name: params.customerName,
    p_customer_phone: params.customerPhone,
    p_pet_name: params.petName,
    p_pet_species: params.petSpecies ?? "dog",
    p_pet_breed: params.petBreed ?? null,
    p_pet_weight_kg: params.petWeightKg ?? null,
    p_pet_notes: params.petNotes ?? null,
  });
}

export interface HandoffResult {
  id: string;
  reason: string;
  status: string;
  persisted: boolean;
}

export function createHandoff(params: {
  conversationId: string;
  reason: string;
  summary?: string | null;
  callbackContact?: string | null;
  bookingId?: string | null;
}): Promise<HandoffResult> {
  return callRpc<HandoffResult>("create_handoff", {
    p_conversation_id: params.conversationId,
    p_reason: params.reason,
    p_summary: params.summary ?? null,
    p_callback_contact: params.callbackContact ?? null,
    p_booking_id: params.bookingId ?? null,
  });
}

export interface SessionState {
  offers: Array<{
    id: string;
    staffName: string;
    serviceName: string;
    startsAt: string;
    startingPriceCents: number;
  }>;
  booking: {
    id: string;
    staffName: string;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    quotedPriceCents: number;
    petName: string;
  } | null;
  handoff: { id: string; status: string } | null;
}

export function getSessionState(conversationId: string): Promise<SessionState> {
  return callRpc<SessionState>("get_session_state", { p_conversation_id: conversationId });
}

/**
 * Map an RpcError to an HTTP response (status + stable code).
 * - P0001 (our `raise exception`) → 409 with the raised token
 * - 23P01 (exclusion/integrity conflict, e.g. slot taken) → 409 slot_taken
 * - anything else (network/DB/5xx) → 503 db_unavailable
 */
export function rpcHttpError(err: unknown): { status: number; code: string; message?: string } {
  if (err instanceof RpcError) {
    if (err.sqlstate === "23P01") {
      return { status: 409, code: "slot_taken", message: err.hint ?? err.message };
    }
    if (err.sqlstate === "P0001") {
      return { status: 409, code: err.message, message: err.hint ?? err.message };
    }
    // Other explicit SQLSTATEs still come back as 409 domain conflicts only if
    // they are integrity/constraint errors; everything else is infra.
    const integrity = ["23505", "23503", "23502", "23514"].includes(err.sqlstate ?? "");
    return integrity
      ? { status: 409, code: "constraint_violation", message: err.hint ?? err.message }
      : { status: 503, code: "db_unavailable", message: err.hint ?? err.message };
  }
  return { status: 503, code: "db_unavailable" };
}
