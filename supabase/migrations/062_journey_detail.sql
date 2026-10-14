-- ============================================================
-- 062_journey_detail.sql — Matloob/Osama, 2026-10-14 (second pass):
--  · station 1 is green only once we've said HOW they came: self-referred,
--    professionally referred, or via an advert
--  · a viewing is assigned to a person and goes into THAT person's diary
--  · the sign-up pack is their seven sections (Synology folders SECTION 1–7)
-- Additive, idempotent.
-- ============================================================
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS referral_source TEXT
  CHECK (referral_source IS NULL OR referral_source IN ('self_referred','professionally_referred','via_advert'));

ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS assigned_to TEXT;
CREATE INDEX IF NOT EXISTS idx_diary_assignee ON public.diary_entries (org_id, assigned_to, starts_at);

-- Which of the seven sign-up sections a tenant document belongs to (1–7); null = not part of the pack.
ALTER TABLE public.tenant_documents ADD COLUMN IF NOT EXISTS section SMALLINT CHECK (section IS NULL OR section BETWEEN 1 AND 7);

-- Leads: the same three ways in; older values stay readable.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check CHECK (source IN ('self_referred','professionally_referred','via_advert','council','self','agency','charity','other'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to TEXT;
