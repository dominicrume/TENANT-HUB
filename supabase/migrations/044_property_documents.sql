-- ============================================================
-- 044_property_documents.sql — the property's own document bucket, separate
-- from a tenant's (BUILD_PLAN C50/C51, M8 — Properties refinement).
--
-- "documents needs to be for the tenant AND for the property" — two separate
-- things, not one shared pile. `tenant_documents` (014) already exists for
-- the tenant side; this is its property-side twin. One row covers both ways
-- a document lands here: added directly (file_url set immediately, status
-- 'received'), or requested from the landlord first and fulfilled later
-- (file_url starts null, status 'requested', filled in on receipt) — C51.
--
-- Deliberately separate from `certificates` (033/035): that table is the
-- compliance matrix with expiry tracking (Paperwork, compliance-watch) and
-- stays exactly as it is. A document requested and received here (even one
-- named "EPC") does NOT also satisfy the Paperwork matrix — that's still
-- added there, with its issue/expiry dates, same as today. Folding the two
-- together is real design work for later, flagged in
-- docs/PROPERTIES_REFINEMENT.md, not assumed here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.property_documents (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id                UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  document_type              TEXT NOT NULL,   -- from the app's dropdown list, or "Other: <label>"
  file_url                   TEXT,            -- storage path; null while only requested, not yet received
  status                     TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('requested', 'received')),
  requested_from_landlord_id UUID REFERENCES public.landlords(id) ON DELETE SET NULL,
  requested_at               TIMESTAMPTZ,
  received_at                TIMESTAMPTZ,
  uploaded_by                TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_documents_property ON public.property_documents (property_id);

ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_property_documents_all" ON public.property_documents;
CREATE POLICY "org_property_documents_all" ON public.property_documents FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

-- Storage bucket, same shape as tenant-documents (014): private, any signed-in
-- profile may read/write (the table's own org_id is what actually scopes
-- which rows a request ever sees — the bucket policy is the same broad grant
-- tenant-documents already uses).
INSERT INTO storage.buckets (id, name, public) VALUES ('property-documents', 'property-documents', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Staff can view property documents bucket" ON storage.objects;
CREATE POLICY "Staff can view property documents bucket" ON storage.objects FOR SELECT USING (
  bucket_id = 'property-documents' AND (auth.uid() IN (SELECT id FROM public.profiles))
);
DROP POLICY IF EXISTS "Staff can upload to property documents bucket" ON storage.objects;
CREATE POLICY "Staff can upload to property documents bucket" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'property-documents' AND (auth.uid() IN (SELECT id FROM public.profiles))
);

NOTIFY pgrst, 'reload schema';
