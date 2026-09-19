// Demo-code gate for POST /api/voice/session.
// The demo code is only ever compared server-side (constant-time).
//
// Gate is OPEN (no code required) only when an explicit development flag
// (`ALLOW_UNGATED_LOCAL_DEV=1`) AND `NODE_ENV !== 'production'` are set.
// A request-controlled Host header never establishes trust: if DEMO_CODE is
// not configured outside that explicit dev setting, the gate FAILS CLOSED.

import { verifyStaticSecret } from "./crypto";
import { optionalEnv } from "./env";

export type GateDecision =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export function checkDemoCode(params: {
  demoCode: string | null | undefined;
}): GateDecision {
  const configured = optionalEnv("DEMO_CODE");

  if (!configured) {
    const allowUngated =
      optionalEnv("ALLOW_UNGATED_LOCAL_DEV") === "1" &&
      process.env.NODE_ENV !== "production";
    if (allowUngated) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 503,
      code: "demo_gate_not_configured",
      message: "Demo code gate is not configured; set DEMO_CODE.",
    };
  }

  if (!params.demoCode) {
    return { ok: false, status: 401, code: "demo_code_required", message: "demoCode is required." };
  }
  if (!verifyStaticSecret(params.demoCode, configured)) {
    return { ok: false, status: 401, code: "invalid_demo_code", message: "Invalid demo code." };
  }
  return { ok: true };
}
