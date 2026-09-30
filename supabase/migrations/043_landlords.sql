-- ============================================================
-- 043_landlords.sql — a real, addable list of landlords (BUILD_PLAN C46,
-- M8 — Properties refinement, docs/PROPERTIES_REFINEMENT.md)
--
-- From the 2026-09-30 client walkthrough: "who owns this property" needs to
-- be a real, growing list a manager can add to from the app — not a fixed
-- 2-value brand enum in the frontend (apps/web/src/contexts/BrandContext.tsx),
-- which is exactly what existed before this. This table is that list.
-- Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.landlords (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landlords_org ON public.landlords (org_id, name);
DROP TRIGGER IF EXISTS trigger_landlords_updated_at ON public.landlords;
CREATE TRIGGER trigger_landlords_updated_at BEFORE UPDATE ON public.landlords FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A property may belong to a landlord. Nullable: existing properties, and any
-- property nobody's got round to assigning yet, stay valid — this is additive,
-- never a forced backfill.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS landlord_id UUID REFERENCES public.landlords(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON public.properties (landlord_id);

ALTER TABLE public.landlords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_landlords_all" ON public.landlords;
CREATE POLICY "org_landlords_all" ON public.landlords FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';
