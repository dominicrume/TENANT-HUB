-- 058_remove_geneva.sql — Rume, 2026-10-14: "Remove Geneva." Data only; idempotent.
-- Links are ON DELETE SET NULL, so nothing else goes with it.
DELETE FROM public.landlords WHERE name = 'Geneva Properties';
