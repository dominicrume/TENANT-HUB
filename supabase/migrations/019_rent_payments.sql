-- Migration: 019_rent_payments.sql
-- FEATURE: Financials & Rent Ledger

CREATE TABLE IF NOT EXISTS public.rent_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_type TEXT NOT NULL, -- e.g., 'Housing Benefit', 'Tenant Top-up', 'Universal Credit'
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_note TEXT,
    recorded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.rent_payments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "org_rent_payments_read"
  ON public.rent_payments FOR SELECT
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE org_id = get_my_org_id()));

CREATE POLICY "org_rent_payments_insert"
  ON public.rent_payments FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM public.tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_rent_payments_update"
  ON public.rent_payments FOR UPDATE
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

-- View to calculate arrears
-- This is a simple view that aggregates service charges and subtracts rent payments.
-- Negative balance = Arrears (Owe money)
-- Positive balance = Credit
CREATE OR REPLACE VIEW public.tenant_arrears_balance AS
SELECT 
    t.id AS tenant_id,
    t.org_id,
    COALESCE(charges.total_charged, 0) AS total_charged,
    COALESCE(payments.total_paid, 0) AS total_paid,
    COALESCE(payments.total_paid, 0) - COALESCE(charges.total_charged, 0) AS balance
FROM 
    public.tenants t
LEFT JOIN (
    SELECT tenant_id, SUM(amount) AS total_charged 
    FROM public.service_charges 
    GROUP BY tenant_id
) charges ON t.id = charges.tenant_id
LEFT JOIN (
    SELECT tenant_id, SUM(amount) AS total_paid 
    FROM public.rent_payments 
    GROUP BY tenant_id
) payments ON t.id = payments.tenant_id;
