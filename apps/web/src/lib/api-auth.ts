/**
 * API auth helper — resolves the authenticated actor for route handlers.
 * Own-session (BUILD_PLAN C31/D27), not Supabase Auth: the th_session cookie
 * is the only source of truth for "who is this", via the same
 * findSessionByTokenHash() path middleware and /api/auth/verify already use.
 * Routes treat a null return as 401 (never silent).
 *
 * `supabase` is kept on the returned shape for the routes not yet migrated
 * off direct Supabase table queries (packages/db is THE write path per
 * CLAUDE.md, but plenty of reads still go through @supabase/ssr). Its
 * construction is wrapped in try/catch: with no Supabase project configured
 * (DECISIONS D27, Railway-only), `createSupabaseServer()` throws, and that
 * must not take authentication down with it — a route that doesn't touch
 * `.supabase` (or that's been migrated to packages/db) has no reason to 500
 * just because an unrelated client failed to construct.
 */
import { db, hasDatabaseUrl, findSessionByTokenHash } from "@tenant-hub/db";
import { hashToken, type UserRole } from "@tenant-hub/auth";
import { readSessionToken } from "./session-cookie";
import { createSupabaseServer } from "./supabase-server";

export interface Actor {
  user_id: string;
  user_name: string;
  user_role: UserRole;
  brand: string;
  org_id?: string;
}

export interface ApiAuth {
  supabase: ReturnType<typeof createSupabaseServer>;
  actor: Actor;
}

export async function getApiAuth(): Promise<ApiAuth | null> {
  if (!hasDatabaseUrl()) return null;

  const token = readSessionToken();
  if (!token) return null;

  const session = await findSessionByTokenHash(db(), hashToken(token)).catch(() => null);
  if (!session) return null;

  // Typed as non-null to match the ~30 existing callers that destructure
  // `auth.supabase` without a null check (most not yet migrated off it).
  // When it fails to construct, those specific callers still 500 on first
  // use exactly as they did before this change — no regression — while
  // every OTHER route, including the ones that no longer touch `.supabase`
  // at all, gets a correctly authenticated actor regardless.
  let supabase: ReturnType<typeof createSupabaseServer>;
  try {
    supabase = createSupabaseServer();
  } catch {
    supabase = null as unknown as ReturnType<typeof createSupabaseServer>;
  }

  return {
    supabase,
    actor: {
      user_id: session.profileId,
      user_name: session.fullName || session.email,
      user_role: session.role as UserRole,
      brand: session.brand,
      org_id: session.orgId ?? undefined,
    },
  };
}

/**
 * Best-effort previous audit hash for a record, to chain the audit log.
 * Takes `supabase` for call-site compatibility with the ~2 remaining callers
 * not yet migrated off it, but ignores it — audit_logs has no RLS boundary
 * a caller needs (writeWithAudit already scopes the write itself), so this
 * reads via packages/db directly rather than needing Supabase configured.
 */
export async function latestAuditHash(
  _supabase: ReturnType<typeof createSupabaseServer>,
  recordId: string,
): Promise<string | undefined> {
  const r = await db().query<{ blockchain_hash: string }>(
    "SELECT blockchain_hash FROM audit_logs WHERE record_id = $1 ORDER BY created_at DESC LIMIT 1",
    [recordId]);
  return r.rows[0]?.blockchain_hash;
}
