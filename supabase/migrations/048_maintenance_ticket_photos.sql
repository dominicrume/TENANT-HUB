-- ============================================================
-- 048_maintenance_ticket_photos.sql — maintenance ticket photos, stored the
-- same way as every other document now (document_blobs, 045): Postgres, not
-- Supabase Storage. maintenance_tickets.photo_url already existed (020) as a
-- free-text Supabase Storage path; left in place, now holds this app's own
-- /api/maintenance/{id}/photo path instead. photo_blob_id is the real
-- pointer. Additive; idempotent.
-- ============================================================

ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS photo_blob_id UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
