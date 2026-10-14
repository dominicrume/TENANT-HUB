-- 059_first_admin.sql — the founder account becomes the organisation admin
-- so the "only the admin adds people" rule has someone to hold it from day
-- one. Idempotent; a no-op where that account doesn't exist (tests).
UPDATE public.profiles SET role = 'admin' WHERE lower(email) = 'dominicrume@gmail.com' AND role = 'manager';
