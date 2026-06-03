# HARDENING.md — H1–H8 Enforcement Checklist

These are the failures that sank the prototype.
Each is now eliminated by construction, not convention.

---

## H1 — AUDIT COVERAGE IS TOTAL
**Failure:** charges and user assignments were silently written without audit hashes.
**Fix:** `packages/db` exposes ONLY `writeWithAudit()`. Raw `.insert/.update` anywhere 
         else is a lint error. CI test: `{tables written} == {tables with audit coverage}`.
**Status:** [ ] Implemented  [ ] CI test passing

---

## H2 — NO RLS BYPASS REACHABLE BY AI
**Failure:** AI package imported Supabase with service-role key, bypassing all RLS.
**Fix:** service-role client lives ONLY in `packages/db`. Un-importable elsewhere 
         (lint zone enforced). `SecureDbGateway` is constructed from RLS-respecting client only.
**Status:** [ ] Implemented  [ ] Import violation test passing

---

## H3 — PROJECTIONS ARE DERIVE-ONLY
**Failure:** projected fields (council support plan header) were re-persisted out of sync.
**Fix:** `ProjectionRegistry.reproject()` returns readonly views. Writing a projection 
         field directly to DB goes through that table's `writeWithAudit()` in ONE transaction.
**Status:** [ ] Implemented  [ ] Lint forbids projection writes outside packages/db

---

## H4 — SIGNATURE BINDING
**Failure:** tenant signed a hash that was never verified against the final record.
**Fix:** Step 5 of intake recomputes canonical hash and asserts it equals the hash 
         displayed in Step 4. Mismatch → reject with error.
**Status:** [ ] Implemented  [ ] Parity test passing

---

## H5 — SERVER-SIDE DRAFTS
**Failure:** intake state stored in localStorage; tablets handed mid-pipeline lost state.
**Fix:** `drafts` table in Supabase, RLS-scoped. XState snapshot serialised to DB after 
         each step. No browser storage for pipeline state.
**Status:** [ ] Implemented  [ ] localStorage usage banned in intake (lint)

---

## H6 — ASYNC STAMP, NEVER ON REQUEST PATH
**Failure:** `await polygonStamp()` blocked HTTP response for 4–8 seconds.
**Fix:** Stamp enqueued in SAME transaction as write (transactional outbox in `stamp_queue`).
         `apps/worker` drains with retries + dead-letter. UI shows pending/done/failed.
**Status:** [ ] Implemented  [ ] Worker running  [ ] UI status displayed

---

## H7 — ONE RUNTIME, ONE DATA PATH
**Failure:** "demo mode" used localStorage for reads but Supabase for writes. Saves silently no-op'd.
**Fix:** `packages/db` exports one `Repository` interface. Both reads and writes always use it.
         No conditional data paths based on env flags.
**Status:** [ ] Implemented  [ ] No USE_LOCAL_DATA flag in codebase

---

## H8 — RESILIENT UI DATA
**Failure:** after a save, background refresh blanked the tenant list.
**Fix:** `useTenants()` hook — single source of truth for all tenant queries. Optimistic 
         updates via React Query. One malformed record cannot crash the list (error boundary per item).
**Status:** [ ] Implemented  [ ] useTenants used everywhere  [ ] Error boundary test passing
