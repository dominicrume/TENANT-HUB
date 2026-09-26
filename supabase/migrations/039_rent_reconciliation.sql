-- ============================================================
-- 039_rent_reconciliation.sql — dedupe keys for the rent-reconciliation agent (BUILD_PLAN C22)
--
-- Two gaps the agent would otherwise hit on every scheduled re-run:
--  1. rent_payments has no way to recognise "I already recorded this bank
--     transaction" — a scheduled agent would re-insert the same payment every
--     day it sees the same transaction from the feed. external_reference plus
--     a partial unique index closes it; a manually-entered payment (via the
--     ledger's "Record Payment" button) has no external_reference and is
--     unaffected.
--  2. service_charges has no constraint stopping two charges for the same
--     tenancy landing on the same due date. The agent checks before it
--     inserts, but the index is the belt-and-suspenders backstop the rest of
--     this schema already uses everywhere else (jobs, compliance_alerts,
--     tenancies). Additive; idempotent.
-- ============================================================

ALTER TABLE public.rent_payments ADD COLUMN IF NOT EXISTS external_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rent_payments_external_ref
  ON public.rent_payments (external_reference) WHERE external_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_charges_tenancy_due
  ON public.service_charges (tenancy_id, due_date) WHERE tenancy_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
