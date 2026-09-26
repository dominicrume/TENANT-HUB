# PLATFORM_CONSOLIDATION.md — Leave Supabase and Vercel, run everything on Railway

> Decision record and migration plan. Companion to `docs/ESTATE_OPS_INTEGRATION_PROMPT.md`.
> Status: PROPOSED 2026-09-26. Becomes ACCEPTED when Rume signs section 6.

## 1. The question

Tenant Hub today runs on three vendors: Vercel (web), Supabase (Postgres, Auth, Storage, Realtime) and, once the agent runtime lands, Railway (worker). Estate Ops runs on one: Railway Postgres + a web service + a worker service from a single Dockerfile. Should Tenant Hub scrap Supabase and consolidate on Railway?

## 2. What Supabase actually does for Tenant Hub today

Be precise about what is being replaced. Grep confirms these dependencies:

| Capability | Where it is used | Portable? |
|---|---|---|
| Postgres | everything | Yes. Supabase is Postgres. `pg_dump` and `pg_restore` move it. |
| `write_with_audit` RPC | `packages/db` | Yes. Plain PL/pgSQL. |
| RLS policies keyed on `auth.uid()`, `get_my_org_id()`, `get_my_role()` | ~30 migrations | No. Every policy must be rewritten to read a per-request setting instead of the Supabase JWT. |
| Supabase Auth: sign-up, sign-in, password reset email, invite flow, token refresh, `auth.users` trigger to `profiles`, `pending_invites` gate | `(auth)/*` pages, `middleware.ts`, `AuthContext`, `api/auth/*`, `api/invites`, migrations 006, 018, 029, 030 | No. This is the real dependency. |
| Two clients: anon client with user cookies for reads, service-role client for writes (DECISIONS D6) | `createSupabaseServer`, `packages/db/src/client.ts`, ~90 API routes | Removed by design, not ported. One client, one session, one write path. |
| Storage bucket `tenant-documents` | migration 014, tenant documents, photos | No. Railway has no object storage. Needs an S3-compatible store behind a port. |
| Realtime `postgres_changes` on `tenants` | `useTenants` hook | Replace with server components plus revalidate-on-action. The hook keeps its contract (H8). |
| Hosted dashboard, advisors, daily backups, PITR add-on, London region | operations | Railway has backups and logs. No UK region (EU West is Amsterdam). No PITR. |

Some of the pain you feel is not Supabase itself. It is the shape we built around it: two clients, auth triggers, signup-gating fixes, `SKIP_ENV_VALIDATION` for Vercel builds. Moving host removes the vendor. The simplification comes from the strangling steps in section 4, which are worth doing even if we stayed.

## 3. The options

**A. Consolidate on Railway by strangling Supabase (recommended).** Replace one dependency at a time behind the package boundaries that already exist, while still hosted on Supabase. Move the database last, by dump and restore, after a parallel-run week. Result: one vendor, one Dockerfile, one Postgres, one session model, one RLS model shared by web and worker. Estate Ops has already proven every piece of the target on Railway.

**B. Stay on Supabase, add Railway for the worker only.** Cheapest this month. Three vendors forever, two clients forever, RLS split between JWT (web) and service role (worker). Rejected as the end state; acceptable as the interim state we pass through.

**C. Big-bang rewrite on Railway now.** Rejected. A live customer with NINOs and dates of birth, no rollback path, auth and storage and RLS all changing at once.

## 4. Option A, step by step

Each step leaves production working and is independently reversible. Steps 1 to 4 happen **while still on Supabase**. Step 5 is the only move.

### Step 1 — One database driver: `pg` over the Supabase pooler
`packages/db` drops `@supabase/supabase-js` for data access and uses `pg` against Supabase's Postgres connection string (transaction-mode pooler). Reads and writes both go through `packages/db` repositories with the session passed in; `createSupabaseServer` for reads is deleted (closes D6, restores H7). The `write_with_audit` RPC becomes a plain `writeWithAudit` transaction with a per-org advisory lock, ported from Estate Ops. `pg` is importable **only** inside `packages/db`; lint enforces it. Nothing moves yet. This step is what makes the agent runtime (integration brief Phase 2) database-host-agnostic, so do it **before** Phase 2, not after.

### Step 2 — RLS keyed on a per-request setting, not on the JWT
Every policy rewritten from `auth.uid()` / `get_my_org_id()` to `current_setting('app.current_org')` and `current_setting('app.current_user')`, set in-transaction by `packages/db` from the session. Policies pass when the settings are absent so migrations and the worker keep working, exactly as Estate Ops migration 013 does. The RBAC parity test now checks the TypeScript matrix against these policies. Ship this as one migration that replaces every policy, tested against a Supabase branch first.

### Step 3 — Own the sessions
Replace Supabase Auth with the Estate Ops model inside `packages/auth`: scrypt password hashes, a `sessions` table holding sha256(token), an httpOnly cookie carrying the raw token, login throttling by email and IP, cross-site POST refusal. Add what Estate Ops did not need and Tenant Hub does: password reset by emailed one-time link, invite by emailed link honouring `pending_invites`, tenant sign-in for the portal, the intake signature page staying public. Email goes through the notify port (Resend). Migrate users: export `auth.users`; Supabase stores bcrypt hashes, so verify bcrypt on first login and rehash to scrypt, or force a one-time reset. Run the new auth for a week with Supabase Auth still present but unused, then drop the trigger and the `auth.*` references.

### Step 4 — Storage behind a port
`StoragePort` in `packages/ports` with `put`, `getSignedUrl`, `delete`. Adapters: Supabase Storage (current) and S3-compatible (Cloudflare R2, EU jurisdiction, no egress fees). Copy the `tenant-documents` bucket to R2, flip the adapter mode, keep the Supabase bucket read-only for a month.

### Step 5 — Move the database and the web app
`pg_dump` from Supabase, `pg_restore` into Railway Postgres (EU West), create the **non-superuser app role** so RLS actually bites, point `DATABASE_URL` at it. Build web and worker from the Estate Ops Dockerfile pattern (`START_CMD` selects the process; web runs migrations on release). Parallel run: worker on Railway reads the Railway copy, web still on Vercel against Supabase, for one week with a nightly diff. Then freeze writes for ten minutes, final dump and restore, cut DNS for `app.mattysplace.org.uk` to the Railway domain, unfreeze. Keep Supabase paused, not deleted, for 30 days.

### Step 6 — Switch off
Delete Vercel project, delete Supabase project after the 30 days, remove `SUPABASE_*` from `packages/env`, remove `@supabase/*` from every `package.json`, lint gate forbids it. Update `CLAUDE.md` tech stack.

## 5. What we gain and what we take on

**Gained**
- One vendor, one dashboard, one bill, one Dockerfile. Logs for web, worker and database in one place.
- One client, one session model, one RLS model for web and worker. H7 becomes literally true.
- The agent runtime lives where the database lives. No cold starts, no serverless timeouts, no third vendor for the worker.
- Fewer moving parts to explain to General Matlub and to the next engineer.

**Taken on**
- We own auth. Password reset, invites, rate limiting, token rotation are our code and our tests. Estate Ops shows it is a few hundred lines, but it is ours to keep.
- We own backups. Railway daily backups plus our own nightly `pg_dump` to R2, tested by restoring monthly. No point-in-time recovery.
- Data residency changes from London to Amsterdam. UK GDPR treats the EU as adequate, so this is lawful, but the Matty's Place data-processing agreement and privacy page must say EU, not UK. Check with the client before Step 5.
- We lose Vercel preview deployments and edge image optimisation. For an internal operations console this is minor; Railway gives PR environments if we want them.
- Effort. Steps 1 to 4 are roughly the size of the integration brief's Phases 2 and 3 again. Budget three to four weeks of agent-driven work with your review, on top of the integration.

## 6. Recommendation and sequencing against the integration brief

Consolidate on Railway (Option A). Do it by strangling, in this order, interleaved with `ESTATE_OPS_INTEGRATION_PROMPT.md`:

1. Integration Phase 0 and Phase 1 (hygiene, the Today screen). No infrastructure change. Ship the hero first.
2. **Consolidation Step 1** (pg driver, one client). Then integration Phase 2 (agent runtime) is written once, against plain Postgres.
3. Integration Phases 3 and 4 (spine, rules, agents), with **Consolidation Step 2** (GUC-based RLS) landing as the first migration of Phase 3 so every new table gets the new policy shape from day one.
4. **Consolidation Steps 3 and 4** (auth, storage) in parallel with integration Phase 5 (screens).
5. Integration Phase 6 (seed, verify, e2e) against Supabase, then **Consolidation Step 5** (the move) as the parallel run, then integration Phase 7 ships on Railway.
6. **Consolidation Step 6** thirty days later.

Signed: ______________________ (Rume)  Date: ____________
