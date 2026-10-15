-- 068: the diary, show-and-tell against Apex27 (Rume, 2026-10-15):
--   · events that repeat (the 11:00 full team meeting every Monday)
--   · who accompanies a viewing (agent / landlord), and the feedback after it
--     (not received / received / shared / skipped) — the legend on their diary
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none','daily','weekdays','weekly','fortnightly','monthly'));
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS recur_until DATE;
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS accompanied_by TEXT
  CHECK (accompanied_by IS NULL OR accompanied_by IN ('agent','landlord','both'));
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS feedback TEXT NOT NULL DEFAULT 'none'
  CHECK (feedback IN ('none','not_received','received','shared','skipped'));
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS feedback_notes TEXT;
