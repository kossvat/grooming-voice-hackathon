// Authentication helpers for the studio dashboard (Supabase Auth Bearer token).

import { anonClient, serviceClient } from "./supabase";

export interface Member {
  userId: string;
  studioId: string;
  role: "staff" | "owner" | "operator";
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Verify a Bearer access token and resolve studio membership.
 * - no/invalid token  -> 401
 * - not a member       -> 403
 * - infra not ready    -> 503
 */
export async function resolveMember(authorization: string | null): Promise<Member> {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new AuthError(401, "unauthenticated");
  }

  try {
    const anon = anonClient();
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data.user) {
      throw new AuthError(401, "unauthenticated");
    }

    const svc = serviceClient();
    const { data: members, error: mErr } = await svc
      .from("studio_members")
      .select("user_id, studio_id, role")
      .eq("user_id", data.user.id)
      .limit(1);

    if (mErr) {
      throw new AuthError(503, "db_unavailable");
    }
    if (!members || members.length === 0) {
      throw new AuthError(403, "not_a_member");
    }

    const m = members[0];
    return {
      userId: m.user_id,
      studioId: m.studio_id,
      role: m.role as Member["role"],
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Network / config errors surface as 503, not 401.
    throw new AuthError(503, "db_unavailable");
  }
}
