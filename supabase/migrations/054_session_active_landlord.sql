-- ============================================================
-- 054_session_active_landlord.sql — the first thing a manager picks after
-- signing in is a LANDLORD, not an organisation (Rume/Osama, 2026-10-09:
-- "Matty's Place is not a landlord, it's a managing agent like us — only
-- landlords should be in that list; when a landlord is added internally it
-- should be available at sign-in automatically"). Organisations stay as
-- the data boundary; the session remembers which landlord's portfolio the
-- person is looking at. Nullable = "all landlords". Additive, idempotent.
-- ============================================================
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS active_landlord_id UUID REFERENCES public.landlords(id) ON DELETE SET NULL;
