// Cryptographic helpers: session capability tokens and the static tool secret.
// Both verified with constant-time comparison.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Fresh capability token (kept only in the browser page memory). */
export function generateSessionCapability(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The DB stores this HMAC, never the raw token, so a database read cannot be
 * replayed as a live capability. Keyed by SESSION_CAPABILITY_SECRET.
 */
export function hashSessionCapability(capability: string, secret: string): string {
  return createHmac("sha256", secret).update(capability).digest("hex");
}

export function verifySessionCapability(capability: string, hash: string, secret: string): boolean {
  const a = Buffer.from(hashSessionCapability(capability, secret), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Constant-time compare for the static webhook tool secret. */
export function verifyStaticSecret(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
