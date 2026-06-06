# HARDENING AUDIT REPORT
**Target:** Tenant Hub (Subscriber #001: Matty's Place)
**Date:** 2026-06-06
**Status:** Pre-flight complete. Issues identified across all 9 Tiers.

## 1. Pre-Flight Checks
- **Typecheck**: ❌ FAILED. `src/contexts/BrandContext.tsx(54,54)`: `Type 'string | undefined' is not assignable to type 'string'`.
- **Lint**: ❌ Untested/Warnings expected based on typecheck.
- **Test**: ❌ Missing Tier 8 CI tests (Audit Coverage, Isolation, Hash Parity).
- **Build**: ❌ Blocked by typecheck.

## 2. Tier 1: Security Hardening (CRITICAL)
- **SEC-01 (Headers)**: `vercel.json` security headers are missing.
- **SEC-02 (Secrets)**: 🚨 **CRITICAL VULNERABILITY**: `SUPABASE_SERVICE_ROLE_KEY` is hardcoded in `apps/web/check_draft.ts` and `apps/web/force_create.ts`.
- **SEC-03 (API Auth/RBAC)**: Most API routes in `apps/web/src/app/api/` do not enforce `requirePermission(role, resource, action)`.
- **SEC-04 (Rate Limiting)**: `@upstash/ratelimit` missing. No API rate limiting in place.
- **SEC-05 (Sanitization)**: `dompurify` missing. Raw HTML inputs are unprotected.
- **SEC-06 (RLS Parity)**: Requires SQL verification of RLS vs `rbac.ts`.
- **SEC-07 (Auth Tokens)**: Needs PKCE enforcement and token rotation.
- **SEC-08 (GDPR)**: Missing `/privacy`, `/terms`, and data erasure endpoint.

## 3. Tier 2: Reliability
- **REL-01 (Error Boundaries)**: Missing `error.tsx` and `not-found.tsx` at the root, and component-level boundaries.
- **REL-02 (DB Retries)**: `packages/db` lacks a `withRetry` wrapper for transient connection failures.
- **REL-03 (Optimistic UI)**: Tenant hooks lack robust optimistic updates (H8 risk).
- **REL-04 (API Responses)**: Standardized `{ data, error, meta }` response shape is not universally enforced.
- **REL-05 (Blockchain)**: `apps/worker` lacks dead-letter queue and webhook alerting.

## 4. Tier 3: Performance
- **PERF-01 (Lighthouse)**: Images and fonts lack optimization; lazy loading needed.
- **PERF-02 (Web Vitals)**: Missing preloads and `next/image` usage.
- **PERF-03 (DB Indexes)**: `CONCURRENTLY` indexes missing for tenants, sessions, and stamp queue.
- **PERF-04 (Next.js config)**: Missing `optimizePackageImports`. Dynamic imports needed for AI Brain.
- **PERF-05 (Realtime)**: Supabase realtime channel not wired up for `useTenants()`.

## 5. Tier 4: SaaS Multi-Tenancy
- **SAAS-01 (Org Table)**: `organisations` table missing. Profiles/Tenants not isolated by org.
- **SAAS-02 (Onboarding)**: No onboarding flow for new HMO providers.
- **SAAS-03 (Team Invites)**: Supabase email invitations not fully implemented via API.
- **SAAS-04 (Stripe)**: Billing infrastructure missing.

## 6. Tier 5: Observability
- **OBS-01 (Logging)**: `pino` structured logging is missing.
- **OBS-02 (Sentry)**: `@sentry/nextjs` missing.
- **OBS-03 (Uptime)**: Vercel cron for `/api/health` missing.
- **OBS-04 (Analytics)**: `@vercel/analytics` missing.

## 7. Tier 6: Production Deployment
- **DEPLOY-01 (Vercel)**: Config needs LHR1 region and Next.js settings.
- **DEPLOY-02 (DNS)**: GoDaddy instructions ready to execute.
- **DEPLOY-03 (CI/CD)**: `.github/workflows/deploy.yml` missing.
- **DEPLOY-04 (Preview URLs)**: PR template missing.

## 8. Tier 7: Accessibility & Polish
- **A11Y-01**: `@axe-core/nextjs` missing. Focus indicators incomplete.
- **POLISH-01**: Transactional emails (`resend`) not configured.
- **POLISH-02**: In-app notifications missing.

## 9. Tier 8: CI Hardening Tests
- **TEST-H1 to TEST-BOUNDARY**: The required `tests/*.test.ts` suite is incomplete.

## Conclusion
The codebase is fundamentally sound regarding the H1-H8 principles, but fails the "Apple/MIT/Stripe" commercial standard. Security Tier 1 (Secrets & RBAC) must be executed immediately before proceeding.
