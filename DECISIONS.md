# DECISIONS.md — Tenant Hub autonomous build

Decisions made under auto-mode when the spec was ambiguous or a safer path was required.
Newest first.

---

## D23 — Homes: "Add tenancy" links an existing tenant, never creates one; QR is generated client-side (2026-09-27, C29)
**Context:** The Homes brief says "Add tenancy in three fields." A fourth field — a brand-new tenant's
name — was tempting, but /intake/new is the only route a new tenant should ever enter through: it
carries the compliance forms, the signature step and the audit trail an ad-hoc insert on the Homes
screen would skip entirely.
**Decision:** "Add tenancy" on the home page always links an EXISTING tenant (chosen from the same
list useTenants() already serves) to a room, with rent amount and frequency as its two typed fields.
A brand-new person still starts at /intake/new. Separately, `Print QR` (the wall poster for
/report/[propertyId], C33) needed a QR image; this sandbox's network access turned out to work for
the npm registry (unlike live API calls, which fail), so `qrcode` (zero further dependencies, MIT)
was added to apps/web and the code is generated entirely client-side — nothing is fetched to draw it,
so it works identically once deployed with no network egress assumption either way.
**Why:** One entry point for a new tenant, never two that could diverge on what "creating a tenant"
actually requires (H8's spirit again). The QR library choice is the smallest dependency that does
the one thing needed, verified to install in this environment before being relied upon.

## D22 — "New laws renders" waits for its own screen (C35), same as D20 (2026-09-27, C27)
**Context:** C27's done-when reads "`regulation_items` fills from legislation.gov.uk on first drain
and New laws renders." The New laws screen is C35, in Phase 5 — it does not exist yet, and Shell.tsx's
own nav comment already says so ("New laws join as their screens land").
**Decision:** Ship regulation-watch now, fully tested on pglite with an injected fake feed (no
network dependency, and legislation.gov.uk is unreachable from this sandbox regardless) — the
housing-irrelevant-item, supported-only-mapping, all-scope-including-mixed, idempotence and
unreachable-feed-ends-quietly scenarios all pass. Defer the New laws screen itself to C35, exactly
the precedent D20 set for compliance-watch and the Paperwork group.
**Why:** Same reasoning as D20 — a done-when describes the feature's eventual, fully-verified
behaviour once its screen lands, not a licence to fake a link into a page that isn't built yet.

## D21 — `needs-you.ts` moved from `apps/web/src/lib` to `@tenant-hub/domain` (2026-09-27, C26)
**Context:** owner-digest's brief is "one email, same list as Today." Today's list is
`buildNeedsYou()`, a pure function that lived only in `apps/web/src/lib` — a leaf app the worker
cannot import (package topology is one-directional, and apps never depend on each other). Hand-porting
its rules into a second, worker-side implementation over pg rows would create exactly the two-queries-
that-can-quietly-diverge failure this whole architecture exists to prevent (CLAUDE.md's prototype
failure #2 — "Tenant list vanished after a save — two different queries diverged").
**Decision:** Moved `needs-you.ts` and its test verbatim into `packages/domain` (it was already
dependency-free — no react/next/supabase imports, pure data in, data out) and re-exported it from
`@tenant-hub/domain`'s index. `apps/web`'s API route, hook and Today page now import it from there
instead of `../lib/needs-you`; behaviour is unchanged. owner-digest fetches the same five row shapes
itself via pg and calls the identical function, so the digest can never show a different list to the
one on screen.
**Why:** One rule set, read by both runtimes, matching H8's actual mechanism (one shared function,
not one shared intention). No behaviour changed for the web app; this is a relocation, not a rewrite.

## D20 — the "Paperwork" group waits for the Homes/Paperwork screens to exist (2026-09-26, C21)
**Context:** The build plan's done-when for compliance-watch is "the seeded missing Fire Risk
Assessment appears on Today with 'Add certificate'." The seed script is C36 and the Paperwork screen
is C32 — both land well after this commit. Wiring a Today group now would need a link target
(`/compliance#property-<id>` or similar) that does not exist yet.
**Decision:** Ship the agent now, fully tested on pglite (the exact missing-Fire-Risk-Assessment
scenario passes). Defer wiring compliance_alerts into needs-you.ts's "Paperwork" group until C32, when
the destination screen exists, so Today never carries a button that 404s.
**Why:** No dead states (UX_FIRST rule 2). A done-when in the plan describes the feature's eventual,
fully-verified behaviour once its dependent screens land — not a requirement to fake a link early.

## D19 — Repairs status vocabulary changes with the screen, not the migration (2026-09-26, C18)
**Context:** The brief maps maintenance_tickets.status onto new | triaged | dispatched | in_progress |
resolved | closed with a CHECK. The live Repairs screen and the tenant portal compare on the current
labels ("Open", "In Progress", "Resolved") and colour-code them.
**Decision:** Migration 036 adds the triage columns (where, how reported, own words, transcript,
category, severity, reasoning) and leaves status text untouched. The vocabulary, the CHECK and a
normalising trigger land with the Repairs screen rebuild (C33), when the API and both screens change in
the same commit.
**Why:** A data change the screens cannot read would show the wrong colours on a live product for the
sake of a schema tidy-up. Severity, not status, is what Today reads.

## D18 — RLS helpers read request settings first; tenant-role leaks closed (2026-09-26, C15)
**Context:** Every policy resolved the caller through `auth.uid()`, directly or via `get_my_org_id()` /
`get_my_role()`. That ties row security to Supabase Auth. Rewriting 90 policies one by one was the plan.
**Decision:** Migration 032 redefines the helpers to read `app.current_user` / `app.current_org` /
`app.current_role` / `app.current_tenant` first and fall back to `auth.uid()` (guarded, so the same SQL
runs on Railway where `auth` does not exist). Policies that used `auth.uid()` or inline profile
subqueries directly are recreated on the helpers; helper-based policies are untouched. A new
`visible_tenant_ids()` returns the whole organisation for staff and only the caller's own tenant for
the tenant role. Roles: web connects without bypassrls, the worker with it.
**Found and fixed on the way:** a tenant login could read every tenant, charge, payment, staff note and
message in its organisation, and goals were role-gated but not org-scoped. Both closed; proven by the
non-superuser pglite test.
**Why:** One RLS model for both hosts, and fail-closed when no identity is present.

## D17 — audit_logs stores the hashed payload (2026-09-26, C14)
**Context:** The chain hash is computed over the write payload (the patch), but the audit row stored only
`record_snapshot` (the full saved row). A chain check could confirm each row links to its predecessor but
could not recompute a single hash, so a tampered payload would go unnoticed.
**Decision:** Migration 031 (not yet applied anywhere) gains `payload JSONB` on `audit_logs`;
`writeWithAudit` fills it. The daily chain-check agent recomputes every hash where a payload exists and
verifies linkage everywhere. Rows written before this column stays nullable and are checked for linkage
only.
**Why:** H12 promises the chain is verifiable, not just present.

## D16 — C09 (reads through pg repositories) waits for DATABASE_URL; C10–C14 go first (2026-09-26)
**Context:** Moving 43 API routes' reads from the Supabase client to pg repositories is security-relevant:
with the pooler's `postgres` role, RLS is bypassed, so every repository must carry explicit org and role
scoping. None of it can be run against a real database in this environment (no DATABASE_URL, no local
Postgres, no Docker). Committing that rewrite unverified is not acceptable.
**Decision:** Reorder within M2: build the agent runtime tables, the pure packages, the job queue, the
adapters and the worker (C10–C14) now — all provable on pglite — and do C09 when DATABASE_URL is present.
M2's gate is unchanged: no `@supabase` import outside packages/db and the auth pages before M2 closes.
**Action required by user:** add `DATABASE_URL` (Supabase → Settings → Database → transaction pooler
URI, port 6543) to `.env.local` and to the Vercel project before the branch merges; nothing in M2 ships to
main without it.

## D15 — writeWithAudit runs on pg; the RPC stays as a fallback until DATABASE_URL exists (2026-09-26, C08)
**Context:** The pg write path is built and proven on an in-process Postgres, but the live pooler URL
is not in this environment, and production (Vercel) has no DATABASE_URL yet.
**Decision:** `writeWithAudit` uses the pg transaction when DATABASE_URL is set and falls back to the
legacy `write_with_audit` RPC when it is not, logging once. Both paths write the same database and the
same audit row shape. The fallback is deleted at C43 with the rest of the Supabase client code.
**Why:** Production must keep working the moment this branch deploys, before the variable is added.
This is a migration seam, not a second data path: same database, same tables, same chain. H7 is
restored the day DATABASE_URL lands, which is the first thing the go-live checklist asks for.

## D14 — Where the folded pages went (2026-09-26, BUILD_PLAN C05)
**Context:** The brief said Sessions, Handovers, Communications, Risk Flags and AI Brain fold into the
tenant record. A shift handover is about the house, not one person; the org-wide sessions list was a
reporting view; risk flags were the same arrears rule Today now shows.
**Decision:** Messages and Ask the AI become tabs on the tenant record. The handover and incident log
become a panel at the top of People (staff read the handover where they look at the people). The
quarterly sessions summary moves onto Reports, which stays a page reached from Today ("Monthly report")
and links on to Analytics. Risk flags are retired: Today's "Money owed" group is the same rule with a
button. Old routes 301 (`next.config.js`). `/audit-log` becomes `/audit` ("What the system did").
**Why:** Every removed function stays reachable in two taps, and nothing about a person lives anywhere
but on the person.

## D13 — Sequencing: hero first, driver before runtime, RLS rewrite before new tables (2026-09-26)
**Context:** The integration brief and the consolidation record each had their own order.
**Decision:** One sequence, `docs/BUILD_PLAN.md` C01–C44. Today ships first with no schema change (M1).
The `pg` driver swap (CON step 1) lands before the agent runtime (M2) so the runtime is written once.
The RLS rewrite to request settings (CON step 2) is the first migration of M3 so every new table gets
the new policy shape. Auth and storage move during the screens milestone. The database moves last, as a
seven-day parallel run. Supabase is paused for 30 days before deletion.
**Why:** A live customer. Every step must leave production working and be reversible on its own.

## D12 — Leave Supabase and Vercel; consolidate on Railway by strangling (2026-09-26)
**Context:** Tenant Hub runs on Vercel + Supabase and needs a long-running worker, which means a third
vendor. Estate Ops proved Postgres + web + worker on Railway from one Dockerfile.
**Decision:** Consolidate on Railway (Option A in `docs/PLATFORM_CONSOLIDATION.md`). Replace one
dependency at a time behind existing package boundaries while still hosted on Supabase: `pg` as the one
driver inside `packages/db`; RLS keyed on `app.current_org`/`app.current_user`/`app.current_role`; own
sessions (scrypt + hashed token table); storage behind a port (R2). Move the database by dump/restore last.
**Why:** One vendor, one client, one session model, one RLS model shared by web and worker. H7 becomes
literally true. Rejected: big-bang rewrite (no rollback with live PII) and staying split forever.
**Action required by user:** sign section 6 of the consolidation record; raise EU data residency with
the client before C39.

## D11 — A third asset class: `supported`, with its own arrears ladder (2026-09-26)
**Context:** Estate Ops selects rule sets by asset class (residential | commercial). Its residential ladder is
reminder → formal letter → solicitor → notice. Matty's Place tenants are vulnerable adults whose arrears
are usually a pending or suspended Housing Benefit / Universal Credit claim.
**Decision:** `packages/domain` gains `supported` as a unit class and ladder: check-in (day 7, auto) →
chase housing benefit (14) → support-plan review (28) → formal letter (56) → manager review (90). Every
rung past check-in requires a recorded human approval. No supported rung ever drafts a notice. Unit tests
enforce both.
**Why:** Sending a formal letter to a vulnerable tenant on day 14 because the council is slow would be
the wrong tool, and would breach the trust the product exists to protect.

## D10 — Fold Estate Ops into Tenant Hub as capabilities; reverse its rule N7 (2026-09-26)
**Context:** `estate-ops 2/` is a finished, deployed Railway product (nine mandated agents, KYA receipts,
ports/adapters, "Needs you today" console) for a private landlord. Its rule N7 forbade anything from the
supported-housing domain crossing into it.
**Decision:** Tenant Hub is the product; Estate Ops is the donor. Port the agent runtime, KYA, ports and
adapters, asset-class rule sets, the property spine and the console into Tenant Hub through
`packages/db` and `writeWithAudit`. One runtime, one data path (H7). Do not run two apps or two
databases. N7 protected a standalone product and does not apply in this direction; N1–N6 become Tenant
Hub hardening rules H9–H14. The folder stays untracked and un-importable; it moves out of the repo at C42.
**Why:** Rume's first principle: stupidly simple, customer-experience back to technology. One product
that acts for the customer, not two to learn.

## D1 — Live secrets removed from tracked `.env.example` (SECURITY)
**Context:** `.env.example` was committed to git containing **real, live secrets**: a Supabase
`SUPABASE_SERVICE_ROLE_KEY` (full RLS bypass), an `openai_api_key`, a `POLYGON_RPC_URL` with an
embedded Alchemy key, and a real `STAMP_WALLET_PRIVATE_KEY`.
**Decision:** Moved the real values into `.env.local` (which is gitignored) and replaced
`.env.example` with name-only placeholders — exactly what the build spec's FINAL section requires
("Ensure .env.example has all variable names (no values)"). Purged the secret blob from the local
git history before any push so it never reaches GitHub.
**Why:** Pushing live credentials — especially a wallet private key and a service-role key — to a
GitHub remote is an irreversible leak. This is non-negotiable regardless of auto-mode.
**Action required by user:** These keys should be considered **compromised** (they sat in a tracked
file) and **rotated**: Supabase service-role + anon keys, the OpenAI key, the Alchemy RPC key, and
the Polygon wallet private key.

## D2 — Push deferred to end of build; remote has unrelated history
**Context:** `github.com/dominicrume/TENANT-HUB` already has a `main` branch whose only commit is
GitHub's auto-generated "Initial commit" (README.md only). Local repo was a fresh `git init` with
unrelated history. `gh` CLI is not installed and no git credentials are configured in this env.
**Decision:** Reconcile by rebasing local history onto `origin/main` (preserves the remote root,
non-destructive) and attempt the push in the FINAL step. If auth is unavailable, the clean history
is ready and the user can push with their own credentials.
**Why:** Force-overwriting a remote I didn't create is destructive; and the push must not happen
until secrets are purged (D1).

## D3 — AI provider: OpenAI vs Anthropic
**Context:** `.env.example` set `ANTHROPIC_API_KEY=` (empty) with a comment "use open ai key
preferred" and supplied an OpenAI key. But `packages/env` requires `ANTHROPIC_API_KEY` to start
with `sk-ant-`, and the Sprint 5 spec says to call Anthropic `claude-sonnet-4`.
**Decision:** Relax `packages/env` to accept `ANTHROPIC_API_KEY` OR `OPENAI_API_KEY` (both
optional). The AI gateway in `packages/ai` selects a provider at runtime: OpenAI when only an
OpenAI key is present (honouring the user's stated preference), Anthropic otherwise.
**Why:** Honours the user's explicit env-level preference while keeping the documented architecture
working with whatever key is configured.

## D9 — Wired ESLint for TypeScript (boundary rules were never running)
**Context:** Package lint scripts ran `eslint src` with no `--ext` and the shared config had no TS
parser, so ESLint matched zero `.js` files and errored ("No files matching the pattern") in every
package. The dependency-boundary rules (H2, ui/ai/db isolation) were therefore never enforced.
**Decision:** Added `@typescript-eslint/parser` + the TS import resolver to `@tenant-hub/eslint-config`,
set the parser/resolver, changed scripts to `eslint src --ext .ts,.tsx`, and added an apps/web
`.eslintrc.json` (`next/core-web-vitals` + boundary config). `pnpm lint` now passes and the
architectural boundaries are actually checked.

## D8 — H4 signature binding computed over the canonical record (not name+date)
**Context:** S3 spec says Step 4 computes `signature_hash` from "(name + date + draftId)" and asserts it
equals the Step 3 `canonical_hash` (which is hashed from the record fields). Those two formulas can
never be equal, so the assertion would always fail.
**Decision:** Implemented true H4 binding: Step 3 stores `canonical_hash = SHA256(canonical record)`.
Step 4 RECOMPUTES the hash from the (unchanged) draft record and asserts equality before accepting
the signature; the tenant's name/date are recorded as signature metadata. Mismatch → reject ("record
changed since review"). This matches HARDENING H4 ("recomputes canonical hash and asserts it equals
the hash displayed in Step 4") and the XState guard `signature_hash === canonical_hash`.

## D7 — Fixed `write_with_audit` RPC: partial UPDATE was a silent no-op
**Context:** Migration `003_write_with_audit_rpc.sql` upserts with
`ON CONFLICT (id) DO UPDATE SET updated_at = NOW()` — it never applies the patched columns. Any
PATCH would change `updated_at` and nothing else: a **silent no-op save**, the exact prototype
failure the whole architecture exists to prevent.
**Decision:** Added `004_fix_write_with_audit_upsert.sql` (CREATE OR REPLACE) that builds a real
dynamic `UPDATE ... SET <provided columns>` for existing rows and INSERTs new rows, keeping the
same audit-log + stamp-queue writes in one transaction.
**Action required by user:** Re-run migration 004 against the Supabase project.

## D6 — Reads via supabase-server (per-request RLS); writes via packages/db
**Context:** `packages/db` exposes a singleton `rlsClient` with no per-request cookies, so it can't
enforce per-user RLS on reads. H7 wants "one data path," but correct RLS needs the user's JWT.
**Decision:** GET/read routes use `createSupabaseServer()` (anon client carrying the user's session
cookies → true RLS). All writes go through `packages/db` `writeWithAudit()` (service-role + audit
in one RPC). This keeps H1/H2 intact and makes reads RLS-correct.

## D5 — Right contextual panel rendered per-page, not by the layout
**Context:** The three-panel spec puts a 280px right "Quick Actions / context" panel in the
dashboard layout. But its content is page-specific (dashboard quick-actions vs tenant Forms Panel),
and the Next.js App Router has no simple named-slot API (parallel routes are heavy for this).
**Decision:** The `(dashboard)/layout.tsx` owns the topbar + left sidebar + main region. Each page
renders its own right rail inside the main region (flex row). The visual result is the same
three-region screen; the structure stays idiomatic.

## D4 — `.env.local` missing at pre-flight (now resolved)
**Context:** Pre-flight step 5 requires `.env.local` with the public Supabase vars. It did not exist.
**Decision:** Created `.env.local` from the values that were (incorrectly) in `.env.example`, so the
app can run locally. See D1 — those values should be rotated.
