-- ============================================================
-- 035_compliance_insurance.sql — certificates and insurance (BUILD_PLAN C18)
--
-- certificate_types is global (statutory sets per unit class); the required
-- set per property is selected in code (@tenant-hub/domain, H13). certificates
-- are what a home actually holds; compliance_alerts are raised by the
-- compliance-watch agent at 90/60/30/7 days, on expiry, and when a required
-- certificate is missing. Insurance ends at a decision card: cycles reach
-- awaiting_decision and a person decides (H10). Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.certificate_types (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL UNIQUE,
  default_validity_months  INT NOT NULL,
  applies_to               public.unit_class NOT NULL,
  statutory_reference      TEXT
);
INSERT INTO public.certificate_types (name, default_validity_months, applies_to, statutory_reference) VALUES
  -- supported housing (HMO)
  ('Gas Safety (CP12)',                     12, 'supported',   'Gas Safety (Installation and Use) Regulations 1998'),
  ('EICR',                                  60, 'supported',   'Electrical Safety Standards in the Private Rented Sector 2020 / HMO licence conditions'),
  ('EPC',                                  120, 'supported',   'Energy Performance of Buildings Regulations 2012'),
  ('Fire Risk Assessment',                  12, 'supported',   'Regulatory Reform (Fire Safety) Order 2005'),
  ('Fire alarm & emergency lighting test',  12, 'supported',   'BS 5839 / BS 5266'),
  ('Smoke & CO alarms',                     12, 'supported',   'Smoke and Carbon Monoxide Alarm (England) Regulations 2015'),
  ('Legionella risk assessment',            24, 'supported',   'HSE ACOP L8'),
  ('HMO licence',                           60, 'supported',   'Housing Act 2004 Part 2'),
  ('PAT testing',                           12, 'supported',   'Electricity at Work Regulations 1989'),
  -- residential lets
  ('Gas Safety (CP12) (residential)',       12, 'residential', 'Gas Safety (Installation and Use) Regulations 1998'),
  ('EICR (residential)',                    60, 'residential', 'Electrical Safety Standards in the Private Rented Sector 2020'),
  ('EPC (residential)',                    120, 'residential', 'Energy Performance of Buildings Regulations 2012'),
  ('Smoke & CO alarms (residential)',       12, 'residential', 'Smoke and Carbon Monoxide Alarm (England) Regulations 2015'),
  ('Legionella risk assessment (residential)', 24, 'residential', 'HSE ACOP L8'),
  -- commercial
  ('EPC (commercial)',                     120, 'commercial',  'Energy Performance of Buildings Regulations 2012 / MEES'),
  ('EICR (commercial)',                     60, 'commercial',  'Electricity at Work Regulations 1989'),
  ('Fire Risk Assessment (commercial)',     12, 'commercial',  'Regulatory Reform (Fire Safety) Order 2005'),
  ('Asbestos Register',                     12, 'commercial',  'Control of Asbestos Regulations 2012'),
  ('Legionella risk assessment (commercial)', 24, 'commercial', 'HSE ACOP L8'),
  ('Emergency lighting',                    12, 'commercial',  'BS 5266')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id             UUID REFERENCES public.units(id) ON DELETE SET NULL,
  certificate_type_id UUID NOT NULL REFERENCES public.certificate_types(id),
  issued_on           DATE,
  expires_on          DATE,
  document_url        TEXT,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_certificates_property ON public.certificates (property_id, certificate_type_id, expires_on DESC);

DO $$ BEGIN CREATE TYPE public.alert_kind AS ENUM ('expiring_90','expiring_60','expiring_30','expiring_7','expired','missing'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.compliance_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  certificate_name TEXT NOT NULL,
  kind             public.alert_kind NOT NULL,
  expires_on       DATE,
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_open ON public.compliance_alerts (org_id, property_id, certificate_name, kind) WHERE resolved_at IS NULL;

-- ── Insurance ───────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE public.cycle_status AS ENUM ('detected','risk_assembled','quotes_gathered','awaiting_decision','decided','lapsed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cycle_decision AS ENUM ('accept','decline','defer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  insurer           TEXT,
  policy_reference  TEXT,
  renewal_date      DATE,
  annual_premium    NUMERIC(10,2),
  sum_insured       NUMERIC(12,2),
  excess            NUMERIC(10,2),
  renewal_lead_days INT NOT NULL DEFAULT 21,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.insurance_renewal_cycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  policy_id     UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  status        public.cycle_status NOT NULL DEFAULT 'detected',
  prior_premium NUMERIC(10,2),
  best_quote_id UUID,
  decision      public.cycle_decision,
  decided_by    UUID REFERENCES public.profiles(id),
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON public.insurance_renewal_cycles (org_id, status);
CREATE TABLE IF NOT EXISTS public.insurance_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  policy_id      UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  cycle_id       UUID NOT NULL REFERENCES public.insurance_renewal_cycles(id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  premium        NUMERIC(10,2) NOT NULL,
  excess         NUMERIC(10,2),
  cover_summary  JSONB,
  source_adapter TEXT NOT NULL,
  is_simulated   BOOLEAN NOT NULL,                     -- H9: never nullable
  retrieved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.certificate_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_policies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_renewal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_quotes         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "certificate_types_read" ON public.certificate_types;
CREATE POLICY "certificate_types_read" ON public.certificate_types FOR SELECT USING (public.current_app_user() IS NOT NULL OR public.get_my_org_id() IS NOT NULL);

-- Certificates: staff manage; a tenant may see the certificates of the home they live in.
DROP POLICY IF EXISTS "org_certificates_read" ON public.certificates;
CREATE POLICY "org_certificates_read" ON public.certificates FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR property_id IN (SELECT u.property_id FROM public.units u JOIN public.tenancies t ON t.unit_id = u.id WHERE t.tenant_id = public.get_my_tenant_id() AND t.status = 'active')));
DROP POLICY IF EXISTS "org_certificates_write" ON public.certificates;
CREATE POLICY "org_certificates_write" ON public.certificates FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_alerts','insurance_policies','insurance_renewal_cycles','insurance_quotes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org_%s_all" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "org_%s_all" ON public.%I FOR ALL USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id())', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
