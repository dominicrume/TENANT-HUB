# Tenant Hub

Enterprise SaaS rebuild of *Matty's Place* — agentic-AI tenant management for HMO /
supported-housing providers (Ash Shahada Housing Association Ltd · Matty's Place · Reliance
Housing). Software-in-service: any provider can manage their tenants from one hardened app.

Built by **MCKI Solutions Ltd, Birmingham** (Rume Dominic Uririe) · Client: **General Matlub,
Ash Shahada HA**.

## What it does
- Three-panel dashboard with a live tenant list (single source of truth — `useTenants()`).
- Full tenant record (Form 3) with audited saves.
- Support **sessions** (with AI follow-up questions), **service-charge ledger**, **intake checklist**.
- 5-step **intake pipeline** (manual / OCR), server-side drafts, tenant signature bound to a
  canonical hash, async blockchain stamp.
- **AI Brain** (read-only, proposes-only), tamper-proof **audit log**, **settings**, printable
  forms / eviction notice / monthly council report.

## Architecture
pnpm + Turborepo monorepo. Next.js 14 App Router, TypeScript strict, Zod, Supabase (Auth + Postgres
+ RLS), XState. See [docs/architecture.md](docs/architecture.md) and the 8 hardening rules in
[docs/HARDENING.md](docs/HARDENING.md). Key invariants: every DB write goes through
`packages/db` `writeWithAudit()`; the service-role client is quarantined there; the AI reaches the
DB only via an injected RLS gateway; the blockchain stamp is async (transactional outbox).

## Setup

### 1. Environment
Copy `.env.example` to `.env.local` and fill in real values (never commit `.env.local`):

```
SUPABASE_URL=                       # https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=          # server only
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=                  # or…
OPENAI_API_KEY=                     # preferred when set; powers AI features
POLYGON_RPC_URL=                    # optional (async stamp)
STAMP_WALLET_PRIVATE_KEY=           # optional
```

### 2. Supabase migrations
Run, in order, in the Supabase SQL editor (or `supabase db push`):

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_write_with_audit_rpc.sql`
4. `supabase/migrations/004_fix_write_with_audit_upsert.sql`  ← fixes the partial-update no-op

### 3. Install & run
```
pnpm install          # uses pnpm@9 via corepack
pnpm dev              # Next.js dev server (apps/web)
```

### 4. Checks
```
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @tenant-hub/web build
```

## Notes
- Decisions made during the build (incl. a security fix to scrub leaked secrets) are in
  [DECISIONS.md](DECISIONS.md).
- Status and known gaps are in [BUILD_REPORT.md](BUILD_REPORT.md).
