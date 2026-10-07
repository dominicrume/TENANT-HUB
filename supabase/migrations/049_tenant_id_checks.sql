-- ============================================================
-- 049_tenant_id_checks.sql — right-to-rent / identity verification checks,
-- one row per check run against a tenant. Built on the same live/simulated
-- adapter pattern as notify, bank feed and insurance quotes (packages/
-- adapters): ADAPTER_MODE_IDCHECK=simulated by default, so this works with
-- zero third-party credentials until a real vendor (Credas, by default) is
-- configured. The check only ever REPORTS an outcome; it never approves or
-- refuses a tenancy itself (H10/H11) — a human always makes the actual
-- right-to-rent decision, which is why `status` has no auto-approve path
-- and every write goes through writeWithAudit (H1).
-- Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_id_checks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL DEFAULT 'credas',
    provider_ref  TEXT NOT NULL,
    mode          TEXT NOT NULL DEFAULT 'simulated', -- live | simulated — carried onto the row so a past check's badge never changes after the fact
    status        TEXT NOT NULL DEFAULT 'pending',    -- pending | pass | refer | fail
    detail        TEXT,
    requested_by  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_id_checks_tenant ON public.tenant_id_checks(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_id_checks_provider_ref ON public.tenant_id_checks(provider, provider_ref);

DROP TRIGGER IF EXISTS trigger_tenant_id_checks_updated_at ON public.tenant_id_checks;
CREATE TRIGGER trigger_tenant_id_checks_updated_at BEFORE UPDATE ON public.tenant_id_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
