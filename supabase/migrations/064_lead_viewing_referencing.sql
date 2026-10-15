-- 064: the lead workflow up to standard (Rume, 2026-10-15): a viewing is booked
-- for a person, at a room, and later marked done; referencing is recorded on
-- the lead (who we asked, when it came back) before sign-up.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS viewing_done_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referee_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referee_contact TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reference_requested_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reference_received_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reference_notes TEXT;
