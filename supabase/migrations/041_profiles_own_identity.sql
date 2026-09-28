-- ============================================================
-- 041_profiles_own_identity.sql — a profile no longer needs a Supabase account (BUILD_PLAN C31)
--
-- profiles.id was a foreign key to auth.users(id), so a person could not exist
-- in Tenant Hub without Supabase Auth having issued them first. The own-session
-- system (040) creates accounts itself from an emailed invite, so that link is
-- dropped and the id gets its own default. Every existing profile keeps its id,
-- and existing rows that came from Supabase Auth are untouched — this only stops
-- REQUIRING the auth.users row. handle_new_user() (001/029) is left in place:
-- it still fires if Supabase Auth ever creates a user, which is exactly what
-- keeps the old login working while both systems coexist. Idempotent.
-- ============================================================

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass AND contype = 'f' AND confrelid = 'auth.users'::regclass;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c); END IF;
END $$;

ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- One live profile per email address, so an invite can never create a second account for someone.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON public.profiles (lower(email)) WHERE email IS NOT NULL;

NOTIFY pgrst, 'reload schema';
