-- ============================================================
-- 045_document_blobs.sql — document bytes live in Postgres now, not
-- Supabase Storage (DECISIONS D27: Railway-only, no object storage
-- service exists to replace it). Kept as a SEPARATE table from
-- tenant_documents/property_documents, not an extra column on them,
-- so a plain "list documents" query never has to pull file bytes across
-- the wire just to show a name and a date — only a dedicated download
-- route touches this table. Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_blobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_blobs_org ON public.document_blobs (org_id);

ALTER TABLE public.tenant_documents
  ADD COLUMN IF NOT EXISTS blob_id UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL;
-- file_url was NOT NULL (it held the Supabase Storage path); blob_id is the
-- real pointer now, so a row with no file_url at all is legitimate.
ALTER TABLE public.tenant_documents ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE public.property_documents
  ADD COLUMN IF NOT EXISTS blob_id UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
