-- 065: referencing worth the name (Rume, 2026-10-15 — "that place of reference is
-- not robust enough"). A lead can have several references (previous landlord,
-- support worker, council, employer…), each asked for, chased and answered in
-- its own right; and the two checks the office does at the same time: ID seen,
-- proof of benefit seen.
CREATE TABLE IF NOT EXISTS public.lead_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('previous_landlord','support_worker','council','employer','character','other')),
  referee_name TEXT NOT NULL,
  contact TEXT,
  method TEXT CHECK (method IN ('phone','email','letter','in_person')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','satisfactory','unsatisfactory','no_reply')),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_references_lead_idx ON public.lead_references(lead_id);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS id_checked_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS benefit_checked_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS no_reference_needed BOOLEAN NOT NULL DEFAULT FALSE;

-- Carry over anything recorded on the single-referee columns from 064.
INSERT INTO public.lead_references (org_id, lead_id, kind, referee_name, contact, requested_at, received_at, outcome, notes)
SELECT org_id, id, 'other', referee_name, referee_contact, COALESCE(reference_requested_at, NOW()), reference_received_at,
       CASE WHEN reference_received_at IS NOT NULL THEN 'satisfactory' ELSE 'pending' END, reference_notes
FROM public.leads WHERE referee_name IS NOT NULL AND referee_name <> '';
