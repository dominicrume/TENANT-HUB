-- ============================================================
-- 050_entity_media.sql — photo galleries for properties and rooms (units).
-- Same Postgres-backed blob pattern as everything else now (document_blobs,
-- 045): a lightweight row pointing at the real bytes, so list views never
-- pull image data. Unlike tenants.photo_blob_id / landlords.photo_blob_id
-- (one photo each), a property or room can carry MANY photos, so this is
-- its own table rather than another single-pointer column — entity_type +
-- entity_id covers both owners without two near-identical tables.
-- Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entity_media (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    entity_type   TEXT NOT NULL CHECK (entity_type IN ('property', 'unit')),
    entity_id     UUID NOT NULL,
    blob_id       UUID NOT NULL REFERENCES public.document_blobs(id) ON DELETE CASCADE,
    caption       TEXT,
    uploaded_by   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_media_owner ON public.entity_media(entity_type, entity_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
