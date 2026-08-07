-- Migration: 028_fix_advisor_warnings.sql
-- FIX: Address Supabase Advisor CRITICAL SECURITY warnings

-- 1. RLS Disabled in Public: Table public.settings is public, but RLS has not been enabled.
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read settings (needed for brand/service charge defaults if queried)
DROP POLICY IF EXISTS "settings_read_all" ON public.settings;
CREATE POLICY "settings_read_all"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

-- Allow only admins to modify settings
DROP POLICY IF EXISTS "settings_update_admin" ON public.settings;
CREATE POLICY "settings_update_admin"
  ON public.settings FOR ALL
  USING (get_my_role() = 'admin');


-- 2. Security Definer View: View public.tenant_arrears_balance is defined with the SECURITY DEFINER property
-- Re-create the view explicitly with security_invoker = true so it respects the underlying table RLS policies
CREATE OR REPLACE VIEW public.tenant_arrears_balance WITH (security_invoker = true) AS
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
