# CLAUDE.md — Tenant Hub
> Read this file first on every session. It is the AI agent's permanent briefing.

## Product
**Tenant Hub** — Enterprise SaaS rebuild of Matty's Place.
HMO tenant management for Ash Shahada Housing Association Ltd / Matty's Place / Reliance Housing.
Client: General Matlub. Built by: Rume Dominic Uririe, MCKI Solutions Ltd, Birmingham.

## The Problem This Solves
The previous prototype had four production failures:
1. Silent 401s — saves appeared to work but did nothing
2. Tenant list vanished after a save (two different queries diverged)
3. AI reached Supabase with service-role key, bypassing RLS
4. Blockchain hash blocked the HTTP request path (sync call)

Every architectural decision in this codebase exists to prevent these four failures by construction.

## Tech Stack
- pnpm workspaces + Turborepo monorepo
- Next.js 14.2 App Router, React 18, TypeScript strict
- Zod — single source of truth for ALL types
- Supabase Auth (JWT) + Postgres + RLS
- Tailwind + design tokens (see packages/ui/src/tokens.ts)
- XState v5 for intake pipeline state machine
- Vitest for all tests

## Design Tokens (NEVER use Tailwind blue-*/red-* in branded components)
- Navy:   #0F1C2E  (sidebar, headers, primary buttons)
- Amber:  #E8A84C  (CTAs, active states, accent)
- Cream:  #F8F4EF  (main canvas background)
- Surface:#FFFFFF  (card backgrounds)
- Fonts:  Sora (UI) + JetBrains Mono (data/timestamps/hashes)

## Package Topology (one-directional, lint-enforced)
```
apps/web          ← Next.js UI + API routes
apps/worker       ← async stamp drainer + AI batch

packages/env          ← ONLY reader of process.env
packages/validation   ← Zod canonical schemas (NINO, phone, money...)
packages/audit        ← SHA-256 hash chain (NO infra imports)
packages/domain       ← Tenant aggregate + ProjectionRegistry
packages/intake-core  ← XState machine (NO react/next/supabase)
packages/ai           ← OCR/notes/mappings (DB via injected port ONLY)
packages/ui           ← design system (PRESENTATIONAL ONLY)
packages/auth         ← RBAC matrix + Supabase guards
packages/db           ← THE ONLY package that writes to DB
packages/blockchain   ← async Polygon stamp (transactional outbox)
```

## Dependency Rules (enforced by ESLint — violations = build failure)
- `ui` NEVER imports domain/ai/db/blockchain/auth
- `ai` NEVER imports ui/blockchain/next/@supabase directly
- `audit/validation/env` import NO infrastructure
- EVERY DB write goes through `packages/db`
- `service-role` client is un-importable outside `packages/db`

## 8 Hardening Rules (see docs/HARDENING.md for full spec)
H1. Every table written has audit coverage — CI-enforced
H2. AI never reaches DB without RLS — service-role client locked to packages/db
H3. Projections are derive-only — no partial fan-out
H4. Tenant signature bound to canonical hash
H5. Intake drafts in DB, never browser storage
H6. Blockchain stamp is ASYNC — never on request path
H7. One runtime, one data path — no demo-mode divergence
H8. Resilient UI — background refreshes never blank a populated list

## Three User Roles
- Manager:        Full access (General Matlub / Ahsan Rehman)
- SupportWorker:  Assigned tenants only
- Tenant:         Read own record + sign only

## Key Files to Read for Context
- docs/architecture.md      — dependency graph + principles
- docs/HARDENING.md         — H1-H8 as enforceable checklist
- packages/validation/src/  — canonical Zod schemas (start here for any form work)
- packages/domain/src/      — Tenant aggregate (start here for any data mutation)
- supabase/migrations/      — DB schema (ground truth for all table shapes)

## Never Do
- Never hardcode tenant data
- Never write to DB outside packages/db
- Never call supabase with service-role key outside packages/db
- Never await blockchain stamp on the HTTP request path
- Never use generic Tailwind colour names in branded components
- Never hand-type a type that could be z.infer<typeof SomeSchema>
- Never store intake machine state in localStorage or sessionStorage
