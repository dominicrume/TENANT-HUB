-- ============================================================
-- 055_profile_photos_access_requests.sql (Rume, 2026-10-09)
--  1. Staff profile photos — same document_blobs store as tenants/landlords
--     (047); "the profile side" of the WhatsApp-style photo experience.
--  2. Access requests — "make it possible for other users to register".
--     Invite-only still holds (nobody gets an account by filling a form):
--     a request lands here, a manager of that organisation approves it,
--     and the approval ISSUES the invite. Additive, idempotent.
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photo_blob_id UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.access_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  role_wanted  TEXT NOT NULL CHECK (role_wanted IN ('manager','support_worker','contractor')),
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_requests_org_status ON public.access_requests (org_id, status, created_at DESC);
