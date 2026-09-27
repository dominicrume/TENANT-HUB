-- ============================================================
-- 040_own_sessions.sql — Tenant Hub's own sessions (BUILD_PLAN C31)
--
-- Supabase Auth still exists and still works while this lands — nothing here
-- removes auth.users or the trigger that provisions a profile from it. This
-- adds the tables the app's OWN login needs: a password hash on profiles
-- (scrypt; a bcrypt hash imported from an existing Supabase account is
-- verified once and then overwritten — packages/auth/src/password.ts),
-- opaque session tokens (only their SHA-256 hash is ever stored — the raw
-- token lives in the httpOnly cookie and nowhere else), a login-attempts log
-- for throttling by email+IP without Upstash, and one-time password-reset
-- tokens. pending_invites (029) gets the same token_hash treatment for its
-- accept-invite link. Additive; idempotent.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_profile ON public.user_sessions (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON public.user_sessions (expires_at);

-- Every attempt, successful or not — the throttle query reads recent failures
-- by email AND by IP, so one leaked password can't be brute-forced from a
-- single machine, and one IP can't be used to spray many accounts.
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  ip           TEXT NOT NULL,
  succeeded    BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (lower(email), attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts (ip, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_password_resets_profile ON public.password_resets (profile_id) WHERE consumed_at IS NULL;

ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_invites_token ON public.pending_invites (token_hash) WHERE token_hash IS NOT NULL;

-- These are read and written only through packages/db (service-role / direct pg,
-- same as every other table this package owns) — never through the Supabase
-- client with a user's own JWT, so there is no "the tenant reads their own
-- session row" case RLS needs to allow. Locking them down is pure defence in
-- depth against a future accidental client-side query.
ALTER TABLE public.user_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_only_user_sessions" ON public.user_sessions;
CREATE POLICY "service_only_user_sessions" ON public.user_sessions FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "service_only_login_attempts" ON public.login_attempts;
CREATE POLICY "service_only_login_attempts" ON public.login_attempts FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "service_only_password_resets" ON public.password_resets;
CREATE POLICY "service_only_password_resets" ON public.password_resets FOR ALL USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
