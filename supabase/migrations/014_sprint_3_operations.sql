-- Migration: 014_sprint_3_operations.sql
-- FEATURE: Operations & Compliance (Maintenance, Documents, Incidents, Handovers)

CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    room_number TEXT NOT NULL,
    issue_type TEXT NOT NULL, -- e.g. Plumbing, Electrical, Furniture
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open', -- Open, In Progress, Resolved
    reported_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "Right to Rent ID", "Tenancy Agreement"
    file_url TEXT NOT NULL, -- Reference to Supabase Storage path
    uploaded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    incident_type TEXT NOT NULL, -- e.g. ASB, Medical, Police
    description TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    incident_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shift_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_type TEXT NOT NULL, -- Morning, Evening, Night
    notes TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;

-- Policies for maintenance_tickets
CREATE POLICY "Staff can view org maintenance" ON public.maintenance_tickets FOR SELECT USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Staff can insert maintenance" ON public.maintenance_tickets FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Staff can update maintenance" ON public.maintenance_tickets FOR UPDATE USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));

-- Policies for tenant_documents
CREATE POLICY "Staff can view tenant docs" ON public.tenant_documents FOR SELECT USING (
    tenant_id IN (SELECT t.id FROM public.tenants t JOIN public.users u ON t.org_id = u.org_id WHERE u.id = auth.uid())
);
CREATE POLICY "Staff can insert tenant docs" ON public.tenant_documents FOR INSERT WITH CHECK (
    tenant_id IN (SELECT t.id FROM public.tenants t JOIN public.users u ON t.org_id = u.org_id WHERE u.id = auth.uid())
);
CREATE POLICY "Staff can delete tenant docs" ON public.tenant_documents FOR DELETE USING (
    tenant_id IN (SELECT t.id FROM public.tenants t JOIN public.users u ON t.org_id = u.org_id WHERE u.id = auth.uid())
);

-- Policies for incident_reports
CREATE POLICY "Staff can view org incidents" ON public.incident_reports FOR SELECT USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Staff can insert incidents" ON public.incident_reports FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Staff can update incidents" ON public.incident_reports FOR UPDATE USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));

-- Policies for shift_handovers
CREATE POLICY "Staff can view org handovers" ON public.shift_handovers FOR SELECT USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Staff can insert handovers" ON public.shift_handovers FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Staff can update handovers" ON public.shift_handovers FOR UPDATE USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_maintenance_tickets_updated_at BEFORE UPDATE ON public.maintenance_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Configure Supabase Storage Bucket for Documents
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-documents', 'tenant-documents', false) ON CONFLICT (id) DO NOTHING;

-- Bucket Security Policies
CREATE POLICY "Staff can view org documents bucket" ON storage.objects FOR SELECT USING (
    bucket_id = 'tenant-documents' AND
    (auth.uid() IN (SELECT id FROM public.users))
);
CREATE POLICY "Staff can upload to documents bucket" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'tenant-documents' AND
    (auth.uid() IN (SELECT id FROM public.users))
);
