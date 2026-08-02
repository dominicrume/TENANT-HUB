-- Add Housing Benefit fields to tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS hb_reference_number TEXT,
ADD COLUMN IF NOT EXISTS hb_claim_date DATE,
ADD COLUMN IF NOT EXISTS hb_document_url TEXT;

-- Refresh schema cache if needed
NOTIFY pgrst, 'reload schema';
