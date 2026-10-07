-- ============================================================
-- 047_entity_photos.sql — tenant and landlord profile photos, stored the
-- same way as every other document now (document_blobs, 045): Postgres,
-- not Supabase Storage. tenants.photo_url already existed as a free-text
-- URL column (it used to hold a Supabase public URL); left in place and
-- still read by the UI unchanged — it now just holds this app's own
-- /api/.../photo path instead. photo_blob_id is the real pointer.
-- Additive; idempotent.
-- ============================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS photo_blob_id UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS photo_blob_id UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS photo_url TEXT;

NOTIFY pgrst, 'reload schema';
