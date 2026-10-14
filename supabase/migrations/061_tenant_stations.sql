-- ============================================================
-- 061_tenant_stations.sql — Matloob, 2026-10-14: "eight stations for every
-- tenant, green when done, red when not, evidence everywhere". Most
-- stations are DERIVED from what's already recorded (the lead, the
-- signature, the move-in date, the HB form in Documents). This table holds
-- the few that are a person's tick — viewing done (and who it's assigned
-- to), moved out — and per-landlord whether the portal station applies.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_stations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  station      TEXT NOT NULL CHECK (station IN ('lead_received','viewing','signed_up','moved_in','claim_done','email_sent','onboarded','moved_out')),
  done_at      TIMESTAMPTZ,
  done_by      TEXT,
  assigned_to  TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, station)
);
CREATE INDEX IF NOT EXISTS idx_tenant_stations_org ON public.tenant_stations (org_id, tenant_id);
DROP TRIGGER IF EXISTS trigger_tenant_stations_updated_at ON public.tenant_stations;
CREATE TRIGGER trigger_tenant_stations_updated_at BEFORE UPDATE ON public.tenant_stations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reliance and Dawson have a tenant portal we must onboard into; Ash
-- Shahada doesn't (yet) — the station shows "not needed" for them.
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS has_portal  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS portal_name TEXT;
UPDATE public.landlords SET has_portal = FALSE WHERE name = 'Ash Shahada Housing Association';
