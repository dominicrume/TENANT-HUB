# Tenant Hub — Build Report

Autonomous full build, 2026-06-03. Pushed to `github.com/dominicrume/TENANT-HUB` (branch `main`).
Quality gates at completion: **typecheck 12/12 ✓ · lint 11/11 ✓ · test 6/6 (16 tests) ✓ ·
`apps/web` production build ✓**.

## Completion Status

### Pre-flight ✅
Deps installed (pnpm via corepack), typecheck/test green, secrets scrubbed (see Decisions),
git initialised + pushed.

### Sprint 1 — Auth + Tenant List + Dashboard ✅
- ✅ S1-A Supabase SSR clients (browser/server/middleware) + session-gating middleware with role header
- ✅ S1-B login / signup / reset-password (functional Supabase Auth)
- ✅ S1-C AuthContext (3s loading watchdog) + BrandContext (localStorage)
- ✅ S1-D three-panel dashboard shell (topbar/sidebar/main; right rail per-page — see D5)
- ✅ S1-E `/api/tenants` + `/api/tenants/[id]` CRUD (+ migration 004 fixing a silent no-op)
- ✅ S1-F `useTenants()` single source of truth
- ✅ S1-G dashboard (stats strip, audit trail, quick actions, recent tenants) + `/api/audit-logs`
- ✅ S1-H sidebar tenant list with search/status
- ✅ S1-I tenant detail + Personal Details (Form 3) + audit stamp + save

### Sprint 2 — Sessions + Ledger + Checklist ✅
- ✅ S2-A `/api/sessions` + Sessions tab + AI Brain questions (`/api/ai/questions`, SecureDbGateway)
- ✅ S2-B `/api/service-charges` + Ledger tab with live balance + paid toggle
- ✅ S2-C `/api/intake-checklists` + Checklist tab

### Sprint 3 — Intake Pipeline ✅
- ✅ Drafts API (server-side, H5) + 5 step pages (input → extract → review → verify → complete)
- ✅ Canonical-hash signature binding asserted at verify + commit (H4); commit via writeWithAudit (H6)
- ⚠️ OCR is provider-portable but text-based (paste/extract); image→text vision wiring is a follow-up

### Sprint 4 — Print + Forms + Eviction + Report ✅
- ✅ FormsPanel right rail, `@media print` CSS, EvictionNoticeModal (EXPORT audit), `/reports` + `/api/reports`

### Sprint 5 — AI Brain + Audit Log + Settings + Sign Out ✅
- ✅ AI Brain page (`/api/ai/task` read-only proposes-only, `/api/risk-flags` rule-based)
- ✅ Audit log (filters, pagination, expandable snapshot, manager CSV export)
- ✅ Settings (Users / Service Charges / Brands / Blockchain Status) + sign-out clears brand
- ⚠️ Service-charge default rate is not yet persisted (needs a `settings` table)

### Sprint 6 — Hardening + Polish ✅
- ✅ Zero TypeScript errors; tests passing (+5 schema tests)
- ✅ Toast system, error boundaries (dashboard + global), README
- ✅ **ESLint wired for TypeScript** — dependency-boundary rules now actually run (D9)
- ⚠️ Responsive: right rail hides <1024px; full tablet/hamburger polish is partial

### Forms ✅
- ✅ International phone numbers (forms brief)
- ✅ `docs/FORMS.md` catalogues the 53 source docs + implementation map (anti-duplication)
- ⚠️ The 53 linked Google Docs were not fetched (external, no creds); they remain the field-level spec

## Decisions Made
Full rationale in [DECISIONS.md](DECISIONS.md). Highlights:
- **D1 (security):** real Supabase service-role key, OpenAI key, Alchemy key and a **wallet private
  key** were committed in `.env.example`. Moved to gitignored `.env.local`, scrubbed the example,
  and **purged them from git history before pushing** (verified absent). **These keys must be rotated.**
- **D3:** AI is provider-flexible — OpenAI preferred (per the env note), Anthropic fallback.
- **D6/D7:** reads use per-request RLS client; writes go through `writeWithAudit`; **fixed migration
  003's silent no-op UPDATE** with migration 004.
- **D8:** H4 signature binding computed over the canonical record.
- **D9:** fixed the never-functional ESLint setup so boundary rules enforce.

## Known Issues / Needs Attention Before Demo
1. **Rotate the leaked credentials** (D1) — highest priority.
2. **Run migration 004** (fixes silent-no-op saves) on the Supabase project.
3. Index routes `/tenants`, `/sessions`, `/ledger`, `/risk-flags` are in the nav but have no
   dedicated list page yet (detail pages + tabs exist); they 404 until added.
4. OCR image→text vision, persisted settings table, and full responsive polish are follow-ups.
5. `apps/web/.env.local` must exist for `next build`/`dev` (copy of root `.env.local`).

## How to Run
```
corepack enable pnpm
pnpm install
cp .env.local apps/web/.env.local      # next loads env from the app dir
pnpm dev                                # http://localhost:3000
```
Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @tenant-hub/web build`

## Supabase Setup Required
Run in order in the SQL editor (or `supabase db push`):
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_write_with_audit_rpc.sql`
4. `supabase/migrations/004_fix_write_with_audit_upsert.sql`

Create at least one auth user; the `handle_new_user` trigger provisions a `profiles` row (role from
signup metadata; set a manager via the Supabase dashboard if needed).

## Test Results
- `pnpm typecheck` — **pass** (12/12 packages)
- `pnpm lint` — **pass** (11/11; boundary rules enforced)
- `pnpm test` — **pass** (6/6 tasks, 16 tests: audit 3, auth 4, validation 9)
- `pnpm --filter @tenant-hub/web build` — **pass** (all routes compiled)

## What Works Right Now (code-complete, typechecked, built)
Auth pages, three-panel dashboard, tenant list + detail + Form 3 save, sessions + AI questions,
ledger, checklist, 5-step intake, print/eviction/council report, AI Brain, audit log, settings,
sign-out. All writes route through `writeWithAudit`; the AI only reads via the RLS gateway; the
blockchain stamp is enqueued, never awaited.

## What Needs Supabase Connected (live behaviour)
Everything data-backed needs a Supabase project with the 4 migrations + a signed-in user: tenant
CRUD, sessions/charges/checklist persistence, audit trail, drafts/intake commit, risk flags,
stamp queue. The async Polygon stamp also needs `apps/worker` running to drain `stamp_queue`.

BUILD COMPLETE — 2026-06-03
