-- Add Housing Benefit fields to tenants
ALTER TABLE public.tenants 
ADD COLUMN hb_reference_number TEXT,
ADD COLUMN hb_claim_date DATE,
ADD COLUMN hb_document_url TEXT;

-- Refresh schema cache if needed
NOTIFY pgrst, 'reload schema';
