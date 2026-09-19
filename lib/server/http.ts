// Minimal JSON response helpers + Next.js route-context typing shims.

import { NextResponse } from "next/server";

export function json(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status });
}

export function ok(body: unknown): NextResponse {
  return json(200, body);
}

export function error(status: number, code: string, message?: string): NextResponse {
  return json(status, { error: code, ...(message ? { message } : {}) });
}
