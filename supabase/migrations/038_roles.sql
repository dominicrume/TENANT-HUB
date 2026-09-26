-- ============================================================
-- 038_roles.sql — the contractor role (BUILD_PLAN C19)
--
-- A contractor is a trade with a login: one screen, /jobs, showing only the
-- dispatch_jobs assigned to their trade (RLS policy "org_dispatch_read" in
-- 036 already reads this role). Contractors never see tenants, money or
-- settings. Middleware already redirects role='contractor' away from
-- /dashboard and /tenants to /jobs (apps/web/src/middleware.ts); this
-- migration is what makes that role assignable.
-- ============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contractor';
