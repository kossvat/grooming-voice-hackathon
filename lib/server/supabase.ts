// Supabase clients (server-side only).
// - serviceClient(): service_role, bypasses RLS, used for all RPCs + writes.
// - anonClient(): publishable key, used only where the user's JWT matters.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv, optionalEnv } from "./env";

let _service: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (_service) return _service;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}

export function anonClient(): SupabaseClient {
  if (_anon) return _anon;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  _anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anon;
}

/** True when the server-side key is present (used for 503 gating). */
export function serviceAvailable(): boolean {
  return Boolean(optionalEnv("NEXT_PUBLIC_SUPABASE_URL") && optionalEnv("SUPABASE_SERVICE_ROLE_KEY"));
}
