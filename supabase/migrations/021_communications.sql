-- Migration: 021_communications.sql
-- FEATURE: Communications & Staff Notes

CREATE TABLE public.staff_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    author_name TEXT NOT NULL,
    note_content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_notes ENABLE ROW LEVEL SECURITY;

-- Create policy for org isolation
CREATE POLICY "Strict isolation for staff_notes" 
ON public.staff_notes FOR ALL 
USING (org_id = public.get_my_org_id());

CREATE TABLE public.communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('Email', 'SMS')),
    message_type TEXT NOT NULL CHECK (message_type IN ('Arrears Reminder', 'Missing Intake Form', 'General Update')),
    content TEXT NOT NULL,
    sent_by TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

-- Create policy for org isolation
CREATE POLICY "Strict isolation for communications" 
ON public.communications FOR ALL 
USING (org_id = public.get_my_org_id());
