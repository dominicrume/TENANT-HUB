-- Migration: 013_custom_forms.sql
-- FEATURE: Dynamic Form Engine (Custom Forms)

CREATE TABLE IF NOT EXISTS public.form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key TEXT NOT NULL,
    schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure a template key is unique per organisation
ALTER TABLE public.form_templates ADD CONSTRAINT unique_template_key_per_org UNIQUE (org_id, key);

-- Ensure a tenant only has one active instance of a specific form template
ALTER TABLE public.tenant_forms ADD CONSTRAINT unique_form_per_tenant UNIQUE (tenant_id, template_id);

-- Enable RLS
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_forms ENABLE ROW LEVEL SECURITY;

-- Policies for form_templates
CREATE POLICY "Users can view org form templates"
    ON public.form_templates FOR SELECT
    USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers can insert form templates"
    ON public.form_templates FOR INSERT
    WITH CHECK (
        org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager')
    );

CREATE POLICY "Managers can update form templates"
    ON public.form_templates FOR UPDATE
    USING (
        org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()) AND
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager')
    );

-- Policies for tenant_forms
CREATE POLICY "Staff can view tenant forms"
    ON public.tenant_forms FOR SELECT
    USING (
        tenant_id IN (
            SELECT t.id FROM public.tenants t 
            JOIN public.profiles u ON t.org_id = u.org_id 
            WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "Staff can insert tenant forms"
    ON public.tenant_forms FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT t.id FROM public.tenants t 
            JOIN public.profiles u ON t.org_id = u.org_id 
            WHERE u.id = auth.uid()
        ) AND
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );

CREATE POLICY "Staff can update tenant forms"
    ON public.tenant_forms FOR UPDATE
    USING (
        tenant_id IN (
            SELECT t.id FROM public.tenants t 
            JOIN public.profiles u ON t.org_id = u.org_id 
            WHERE u.id = auth.uid()
        ) AND
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );

-- Trigger for updated_at on tenant_forms
CREATE OR REPLACE FUNCTION set_tenant_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_forms_updated_at
BEFORE UPDATE ON public.tenant_forms
FOR EACH ROW
EXECUTE FUNCTION set_tenant_forms_updated_at();

-- Seed Default Templates Function (runs after org creation, or manually for existing)
CREATE OR REPLACE FUNCTION seed_default_form_templates(target_org_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.form_templates (org_id, name, key, schema) VALUES
    (target_org_id, 'Housing Benefit', 'hb', '[
        {"id": "hb_ref", "type": "text", "label": "HB Reference Number", "required": true},
        {"id": "hb_status", "type": "select", "label": "Claim Status", "options": ["Not Started", "In Progress", "Awarded", "Suspended"], "required": true},
        {"id": "hb_notes", "type": "textarea", "label": "Notes", "required": false}
    ]'::jsonb),
    (target_org_id, 'Missing Person', 'missing', '[
        {"id": "reported_date", "type": "date", "label": "Date Reported Missing", "required": false},
        {"id": "police_ref", "type": "text", "label": "Police Reference (CAD)", "required": false},
        {"id": "description", "type": "textarea", "label": "Description of clothing/appearance", "required": false}
    ]'::jsonb),
    (target_org_id, 'Risk Assessment', 'risk', '[
        {"id": "risk_level", "type": "select", "label": "Overall Risk Level", "options": ["Low", "Medium", "High", "Critical"], "required": true},
        {"id": "self_harm", "type": "checkbox", "label": "Risk of Self Harm", "required": false},
        {"id": "substance", "type": "checkbox", "label": "Substance Misuse", "required": false},
        {"id": "risk_details", "type": "textarea", "label": "Detailed Assessment", "required": true}
    ]'::jsonb),
    (target_org_id, 'Initial Assessment', 'initial', '[
        {"id": "assessment_date", "type": "date", "label": "Assessment Date", "required": true},
        {"id": "assessor_name", "type": "text", "label": "Assessor Name", "required": true},
        {"id": "support_needs", "type": "textarea", "label": "Identified Support Needs", "required": true}
    ]'::jsonb)
    ON CONFLICT (org_id, key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Automatically seed for all existing orgs (for deployment)
DO $$
DECLARE
    org RECORD;
BEGIN
    FOR org IN SELECT id FROM public.organisations LOOP
        PERFORM seed_default_form_templates(org.id);
    END LOOP;
END;
$$;
