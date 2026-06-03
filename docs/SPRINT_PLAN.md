# Sprint Plan — Tenant Hub

## Sprint 0 (DONE) — Architecture Scaffold
- [x] Monorepo with pnpm + Turborepo
- [x] 12 packages scaffolded with correct dependency rules
- [x] ESLint boundary enforcement
- [x] Zod canonical schemas (validation package)
- [x] SHA-256 audit chain (audit package)
- [x] Tenant aggregate + ProjectionRegistry (domain package)
- [x] XState intake machine (intake-core package)
- [x] Supabase migrations (3 files: schema, RLS, write_with_audit RPC)
- [x] CLAUDE.md + docs/architecture.md + docs/HARDENING.md
- [x] useTenants hook stub (H8 architecture in place)

## Sprint 1 — Auth + Tenant List (Week 3)
- [ ] Wire Supabase Auth in apps/web/src/app/(auth)/
- [ ] Wire TenantRepository.findAll() to GET /api/tenants
- [ ] Build sidebar tenant list using useTenants() hook
- [ ] Build dashboard stats widget using same useTenants() hook
- [ ] Verify stats count == list count (H8 parity)
- [ ] RBAC middleware — protect routes by role

## Sprint 2 — Intake Pipeline (Week 4)
- [ ] Build all 5 intake steps using XState machine from intake-core
- [ ] Persist draft to drafts table after each step (H5)
- [ ] OCR upload + extraction UI (Step 2)
- [ ] Staff confirmation with canonical hash (Step 3, H4)
- [ ] Tenant verification portal + SignaturePad (Step 4)
- [ ] DB commit via writeWithAudit (Step 5)

## Sprint 3 — Sessions + Ledger (Week 5)
- [ ] Sessions (Daily/Weekly/Monthly) with useTenants data
- [ ] AI Brain — generateSessionQuestions via SecureDbGateway (H2)
- [ ] Service Charge Ledger with writeWithAudit on every payment

## Sprint 4 — Print + Reports (Week 6)
- [ ] Print active form (CSS @media print)
- [ ] Monthly council support plan export
- [ ] Blockchain stamp status UI (pending/done/failed from stamp_queue)

## Sprint 5 — Hardening + Deploy (Week 7-8)
- [ ] CI tests: H1 audit coverage, H2 RLS bypass, H4 hash parity, RBAC parity
- [ ] Worker draining stamp_queue with retries
- [ ] Google Cloud Run deployment
- [ ] Penetration: verify no service-role key reachable outside packages/db
