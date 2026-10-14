-- 063_diary_status.sql — the diary grows up (Rume, 2026-10-15: "a senior
-- diary planner… month, week, day, list, user"): events carry a status
-- (confirmed / unconfirmed / cancelled), an end time already exists, and
-- "task" joins the kinds. Additive, idempotent.
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','unconfirmed','cancelled'));
ALTER TABLE public.diary_entries DROP CONSTRAINT IF EXISTS diary_entries_kind_check;
ALTER TABLE public.diary_entries ADD CONSTRAINT diary_entries_kind_check CHECK (kind IN ('viewing','inspection','maintenance','meeting','call','move_in','move_out','task','valuation','other'));
-- Signed sign-up forms: when it was signed and by whom (the tenant's name as typed), so the slot can say "signed 15 Oct".
ALTER TABLE public.tenant_documents ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE public.tenant_documents ADD COLUMN IF NOT EXISTS signed_by TEXT;
