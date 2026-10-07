-- ============================================================
-- 046_multi_org_access.sql — a manager account can belong to more than one
-- organisation (BUILD_PLAN: post-login workspace picker). profiles.org_id
-- stays as the "home" org, unchanged, used by everyone who only ever
-- belongs to one; this adds explicit extra grants on top of it, and a
-- per-SESSION "which org am I in right now" so picking one is a session
-- property, not a profile-wide setting (two tabs could, in principle, sit
-- in two different orgs). Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profile_organisations (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_orgs_profile ON public.profile_organisations (profile_id);

-- NULL means "use this profile's own org_id" — true for almost everyone
-- (support workers, tenants, single-org managers). Only a multi-org
-- manager who has actually switched ever has this set to something else.
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS active_org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
