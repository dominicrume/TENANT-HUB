-- 066: a support session is signed off by both people in the room (Matloob,
-- 2026-10-15): the support worker and the tenant each sign under the note;
-- the signatures print on the monthly report under that session.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS worker_signature TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS worker_signed_at TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tenant_signature TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tenant_signed_at TIMESTAMPTZ;
