-- ============================================================
-- 033_property_spine.sql — homes → rooms → tenancies (BUILD_PLAN C16)
--
-- A tenant is a person; where they live is a tenancy of a unit in a property.
-- Existing tenants rows keep their address/postcode/room_number columns as
-- PROJECTIONS derived from the active tenancy (H3); the backfill below creates
-- the spine from those columns exactly once per organisation.
-- Asset class selects the rule set in code (H13): supported | residential |
-- commercial | mixed. Additive; idempotent.
-- ============================================================

DO $$ BEGIN CREATE TYPE public.asset_class AS ENUM ('supported','residential','commercial','mixed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.unit_class AS ENUM ('supported','residential','commercial'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.unit_status AS ENUM ('occupied','vacant','refurbishment','held'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tenancy_type AS ENUM ('supported_licence','licence','ast','commercial_lease','company_let'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.rent_frequency AS ENUM ('weekly','fortnightly','four_weekly','monthly','quarterly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tenancy_status AS ENUM ('draft','active','ending','ended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address_line1 TEXT,
  city          TEXT,
  postcode      TEXT,
  asset_class   public.asset_class NOT NULL DEFAULT 'supported',
  floors        INT,
  rebuild_value NUMERIC(12,2),
  acquired_on   DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties (org_id, name);

CREATE TABLE IF NOT EXISTS public.units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reference   TEXT NOT NULL,                      -- "Room 4", "Flat 2", "Unit B"
  unit_class  public.unit_class NOT NULL DEFAULT 'supported',
  floor       INT,
  bedrooms    INT,
  status      public.unit_status NOT NULL DEFAULT 'vacant',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_units_property ON public.units (property_id);

CREATE TABLE IF NOT EXISTS public.tenancies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  unit_id        UUID NOT NULL REFERENCES public.units(id),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenancy_type   public.tenancy_type NOT NULL DEFAULT 'supported_licence',
  start_date     DATE,
  end_date       DATE,
  rent_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  rent_frequency public.rent_frequency NOT NULL DEFAULT 'weekly',
  rent_due_day   INT,
  status         public.tenancy_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant ON public.tenancies (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenancies_unit ON public.tenancies (unit_id, status);
-- One active tenancy per tenant, one active tenancy per unit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancies_one_active_per_tenant ON public.tenancies (tenant_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancies_one_active_per_unit ON public.tenancies (unit_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS trigger_properties_updated_at ON public.properties;
CREATE TRIGGER trigger_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trigger_units_updated_at ON public.units;
CREATE TRIGGER trigger_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trigger_tenancies_updated_at ON public.tenancies;
CREATE TRIGGER trigger_tenancies_updated_at BEFORE UPDATE ON public.tenancies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS: staff see and manage the organisation's homes; a tenant sees only where they live ──
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancies  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_properties_read" ON public.properties;
CREATE POLICY "org_properties_read" ON public.properties FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR id IN (SELECT u.property_id FROM public.units u JOIN public.tenancies t ON t.unit_id = u.id WHERE t.tenant_id = public.get_my_tenant_id() AND t.status = 'active')));
DROP POLICY IF EXISTS "org_properties_write" ON public.properties;
CREATE POLICY "org_properties_write" ON public.properties FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_staff()) WITH CHECK (org_id = public.get_my_org_id() AND public.is_staff());

DROP POLICY IF EXISTS "org_units_read" ON public.units;
CREATE POLICY "org_units_read" ON public.units FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR id IN (SELECT unit_id FROM public.tenancies WHERE tenant_id = public.get_my_tenant_id() AND status = 'active')));
DROP POLICY IF EXISTS "org_units_write" ON public.units;
CREATE POLICY "org_units_write" ON public.units FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_staff()) WITH CHECK (org_id = public.get_my_org_id() AND public.is_staff());

DROP POLICY IF EXISTS "org_tenancies_read" ON public.tenancies;
CREATE POLICY "org_tenancies_read" ON public.tenancies FOR SELECT
  USING (org_id = public.get_my_org_id() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "org_tenancies_write" ON public.tenancies;
CREATE POLICY "org_tenancies_write" ON public.tenancies FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_staff()) WITH CHECK (org_id = public.get_my_org_id() AND public.is_staff());

-- ── Backfill: once per organisation that has tenants but no homes yet ───────
-- A home per distinct (address, postcode); a room per distinct room_number; an
-- active tenancy per active tenant, rent from the brand's service charge default.
DO $$
DECLARE
  o RECORD; t RECORD; v_property UUID; v_unit UUID; v_rent NUMERIC(10,2);
  n_props INT := 0; n_units INT := 0; n_tenancies INT := 0;
BEGIN
  FOR o IN
    SELECT DISTINCT org_id FROM public.tenants tn
    WHERE org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.org_id = tn.org_id)
  LOOP
    FOR t IN
      SELECT * FROM public.tenants WHERE org_id = o.org_id ORDER BY created_at
    LOOP
      -- Home
      SELECT id INTO v_property FROM public.properties
       WHERE org_id = o.org_id AND COALESCE(address_line1,'') = COALESCE(t.address,'') AND COALESCE(postcode,'') = COALESCE(t.postcode,'') LIMIT 1;
      IF v_property IS NULL THEN
        INSERT INTO public.properties (org_id, name, address_line1, postcode, asset_class)
        VALUES (o.org_id, COALESCE(NULLIF(t.address,''), 'Home ' || (n_props + 1)), t.address, t.postcode, 'supported')
        RETURNING id INTO v_property;
        n_props := n_props + 1;
      END IF;
      -- Room
      SELECT id INTO v_unit FROM public.units WHERE property_id = v_property AND reference = COALESCE(NULLIF(t.room_number,''), 'Room ?');
      IF v_unit IS NULL THEN
        INSERT INTO public.units (org_id, property_id, reference, unit_class, status)
        VALUES (o.org_id, v_property, COALESCE(NULLIF(t.room_number,''), 'Room ?'), 'supported', (CASE WHEN t.is_active AND NOT COALESCE(t.is_archived, FALSE) THEN 'occupied' ELSE 'vacant' END)::public.unit_status)
        RETURNING id INTO v_unit;
        n_units := n_units + 1;
      END IF;
      -- Tenancy (active tenants only; one active per unit — a shared room keeps the first)
      IF t.is_active AND NOT COALESCE(t.is_archived, FALSE)
         AND NOT EXISTS (SELECT 1 FROM public.tenancies WHERE unit_id = v_unit AND status = 'active') THEN
        SELECT service_charge_default INTO v_rent FROM public.settings WHERE brand::text = t.brand::text LIMIT 1;
        INSERT INTO public.tenancies (org_id, unit_id, tenant_id, tenancy_type, start_date, rent_amount, rent_frequency, status)
        VALUES (o.org_id, v_unit, t.id, 'supported_licence', t.moved_in, COALESCE(v_rent, 0), 'weekly', 'active');
        n_tenancies := n_tenancies + 1;
      END IF;
      v_property := NULL; v_unit := NULL;
    END LOOP;
  END LOOP;
  RAISE NOTICE '033 backfill: % homes, % rooms, % tenancies created', n_props, n_units, n_tenancies;
END $$;

NOTIFY pgrst, 'reload schema';
