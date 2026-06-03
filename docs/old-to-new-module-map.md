# Old → New Module Map

| Old Location | New Location | Notes |
|---|---|---|
| src/lib/supabase.ts (service-role) | packages/db/src/client.ts | QUARANTINED — un-importable outside db package |
| src/lib/supabase.ts (anon) | packages/db/src/client.ts | Exported as `rls_client` |
| src/context/AuthContext.tsx | packages/auth/src/context.tsx | Now uses RBAC matrix |
| src/hooks/useTenants.ts | packages/db/src/repositories/tenant.repo.ts + apps/web/src/hooks/useTenants.ts | Split: DB query in repo, React hook in web |
| src/lib/audit.ts | packages/audit/src/chain.ts | No infra imports; pure SHA-256 |
| src/lib/blockchain.ts | packages/blockchain/src/stamp.ts | Async only; outbox pattern |
| src/app/intake/... | apps/web/src/app/(intake)/ + packages/intake-core/ | State machine in framework-free package |
| src/components/ui/... | packages/ui/src/components/ | Presentational only |
| src/lib/ai.ts | packages/ai/src/orchestrator.ts | SecureDbGateway injected; no direct Supabase |
| Inline Zod schemas | packages/validation/src/schemas/ | Canonical, shared everywhere |
| process.env.X everywhere | packages/env/src/index.ts | Single reader, fail-fast |
| localStorage draft state | supabase: drafts table | Server-side, RLS-scoped |
