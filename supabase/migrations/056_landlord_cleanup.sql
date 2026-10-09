-- ============================================================
-- 056_landlord_cleanup.sql — Rume, 2026-10-10: "delete every other landlord
-- currently on the system and leave only Reliance, Geneva, Dawson, Ash
-- Shahada". Data, not schema: idempotent, and a no-op on an empty database
-- (the INSERTs select their organisation by name, so a test replay with no
-- organisations inserts nothing).
--
-- Every link to a landlord is ON DELETE SET NULL (properties.landlord_id,
-- property_documents.requested_from_landlord_id, user_sessions.
-- active_landlord_id), so nothing else is removed: a property whose
-- landlord goes reads "Landlord not set" until staff pick the right one.
-- ============================================================

-- The C.I.C record IS Reliance as a landlord — keep it, under its plain name.
UPDATE public.landlords SET name = 'Reliance Housing' WHERE name = 'Reliance Social Housing C.I.C';

-- Geneva Properties lives in the Reliance Housing workspace (where Osama works).
INSERT INTO public.landlords (org_id, name)
SELECT o.id, 'Geneva Properties' FROM public.organisations o
WHERE o.name = 'Reliance Housing'
  AND NOT EXISTS (SELECT 1 FROM public.landlords l WHERE l.org_id = o.id AND l.name = 'Geneva Properties');

-- Ash Shahada as a landlord, in its own workspace.
INSERT INTO public.landlords (org_id, name)
SELECT o.id, 'Ash Shahada Housing Association' FROM public.organisations o
WHERE o.name = 'Ash Shahada Housing Association'
  AND NOT EXISTS (SELECT 1 FROM public.landlords l WHERE l.org_id = o.id AND l.name = 'Ash Shahada Housing Association');

-- Everyone else goes (test records from the build: Orume ×3, General Matlub,
-- Arshad Rajput, Tarik Rehman, muhammad rehman, R ELIZ).
DELETE FROM public.landlords
WHERE name NOT IN ('Reliance Housing', 'Geneva Properties', 'Dawson Housing', 'Ash Shahada Housing Association');
