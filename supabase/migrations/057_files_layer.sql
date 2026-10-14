-- ============================================================
-- 057_files_layer.sql — the file layer, built to docs/FILES_SPEC.md
-- (Rume, 2026-10-10: "a data storage system… retrieval, file sharing, file
-- storage, profile picture link… from a manager's perspective").
-- Additive and idempotent. Bytes stay in document_blobs (045).
-- ============================================================

-- Verifiable, cacheable, fast-to-look-at blobs.
ALTER TABLE public.document_blobs ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE public.document_blobs ADD COLUMN IF NOT EXISTS thumb  BYTEA;   -- ≤320px JPEG made on the device at upload (images only)
ALTER TABLE public.document_blobs ADD COLUMN IF NOT EXISTS width  INTEGER;
ALTER TABLE public.document_blobs ADD COLUMN IF NOT EXISTS height INTEGER;
UPDATE public.document_blobs SET sha256 = encode(sha256(data), 'hex') WHERE sha256 IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_blobs_sha ON public.document_blobs (sha256);

-- The third document tree: what the LANDLORD must give us (ID, proof of
-- ownership, management agreement, buildings insurance, bank details…).
CREATE TABLE IF NOT EXISTS public.landlord_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  landlord_id   UUID NOT NULL REFERENCES public.landlords(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  blob_id       UUID REFERENCES public.document_blobs(id) ON DELETE SET NULL,
  uploaded_by   TEXT NOT NULL,
  expires_on    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landlord_documents_landlord ON public.landlord_documents (landlord_id, created_at DESC);

-- Galleries: a cover photo and an order.
ALTER TABLE public.entity_media ADD COLUMN IF NOT EXISTS is_cover   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.entity_media ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Expiring share links: hand a file to a landlord, a council officer, a
-- solicitor — no account, no attachment. Opens are counted; revocable.
CREATE TABLE IF NOT EXISTS public.file_shares (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  blob_id        UUID NOT NULL REFERENCES public.document_blobs(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  label          TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_by     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ,
  open_count     INTEGER NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_file_shares_org ON public.file_shares (org_id, created_at DESC);
