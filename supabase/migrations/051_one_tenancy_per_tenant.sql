-- ============================================================
-- 051_one_tenancy_per_tenant.sql — a person lives in one room at a time.
-- Rume, 2026-10-08: a tenant turning up on two properties at once is a
-- real problem, close it. The API refuses a second active tenancy with a
-- clear message (apps/web/src/app/api/tenancies/route.ts); these partial
-- unique indexes make it impossible underneath — a race, a script or a
-- direct write can't violate it either. Ended tenancies (status 'ended'/
-- 'ending'/'draft') don't count, so history and moves still work: end the
-- old one, add the new one.
--
-- Also: property_documents.notified_at — when "request from landlord"
-- actually emailed the landlord. Until now a request was only ever a row
-- with status 'requested'; nobody was told. Null = no email went (no
-- address on file, or sending failed) — shown as such, never pretended.
-- Additive; idempotent.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancies_one_active_per_tenant
  ON public.tenancies (tenant_id) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenancies_one_active_per_unit
  ON public.tenancies (unit_id) WHERE status = 'active';

ALTER TABLE public.property_documents ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
