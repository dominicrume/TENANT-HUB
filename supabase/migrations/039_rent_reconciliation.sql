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
--
-- Both CREATE UNIQUE INDEX statements below are wrapped in DO blocks that
-- swallow unique_violation: these are backstop constraints, not core
-- functionality (the agent already checks before it inserts), and a
-- database that already has real, pre-existing rows violating one of them
-- must never have THIS migration be the thing that blocks every migration
-- after it from running. Found the hard way: running this against a
-- database with real data, a duplicate (tenant_id, due_date) pair aborted
-- the whole batch and silently took 040-044 down with it. A table that's
-- missing the column entirely (undefined_column) is swallowed the same way,
-- for a database where 034 hasn't landed yet for some other reason.
-- ============================================================

ALTER TABLE public.rent_payments ADD COLUMN IF NOT EXISTS external_reference TEXT;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_rent_payments_external_ref
    ON public.rent_payments (external_reference) WHERE external_reference IS NOT NULL;
EXCEPTION WHEN unique_violation OR undefined_column THEN
  RAISE NOTICE 'idx_rent_payments_external_ref not created — pre-existing data conflicts with it. Not fatal; investigate separately.';
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_service_charges_tenancy_due
    ON public.service_charges (tenancy_id, due_date) WHERE tenancy_id IS NOT NULL;
EXCEPTION WHEN unique_violation OR undefined_column THEN
  RAISE NOTICE 'idx_service_charges_tenancy_due not created — pre-existing data conflicts with it. Not fatal; investigate separately.';
END $$;

NOTIFY pgrst, 'reload schema';
