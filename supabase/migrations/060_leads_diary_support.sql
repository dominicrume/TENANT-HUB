-- ============================================================
-- 060_leads_diary_support.sql — Matloob, 2026-10-14: "add leads, diary,
-- financials, support — four buttons; change People to Tenants; a timeline
-- on the dashboard: lead received → referenced → …". Additive, idempotent.
-- Financials needs no new table (it's a view over charges/payments/tenancies).
-- ============================================================

-- A lead is a person who might become a tenant: council referral, self
-- referral, agency. The stage IS the dashboard timeline.
CREATE TABLE IF NOT EXISTS public.leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  source        TEXT NOT NULL DEFAULT 'other' CHECK (source IN ('council','self','agency','charity','other')),
  stage         TEXT NOT NULL DEFAULT 'received' CHECK (stage IN ('received','referenced','viewing','offer','moved_in','lost')),
  notes         TEXT,
  property_id   UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id       UUID REFERENCES public.units(id) ON DELETE SET NULL,
  landlord_id   UUID REFERENCES public.landlords(id) ON DELETE SET NULL,
  viewing_at    TIMESTAMPTZ,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE SET NULL,   -- set when they move in
  lost_reason   TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_org_stage ON public.leads (org_id, stage, created_at DESC);
DROP TRIGGER IF EXISTS trigger_leads_updated_at ON public.leads;
CREATE TRIGGER trigger_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The diary: what has to happen on a day. Entries made by hand live here;
-- viewings (leads), sessions, promises (commitments), repairs and expiring
-- certificates are read from their own tables into the same day view.
CREATE TABLE IF NOT EXISTS public.diary_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('viewing','inspection','maintenance','meeting','call','move_in','move_out','other')),
  title         TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  property_id   UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  lead_id       UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  notes         TEXT,
  done_at       TIMESTAMPTZ,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diary_org_when ON public.diary_entries (org_id, starts_at);

-- "Support always should be there for me": a message to the people who
-- build and run Tenant Hub, kept here and emailed on.
CREATE TABLE IF NOT EXISTS public.support_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_name     TEXT NOT NULL,
  from_email    TEXT,
  kind          TEXT NOT NULL DEFAULT 'question' CHECK (kind IN ('question','problem','idea','urgent')),
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  page_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  emailed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_org ON public.support_requests (org_id, created_at DESC);
