# DECISIONS.md — Tenant Hub autonomous build

Decisions made under auto-mode when the spec was ambiguous or a safer path was required.
Newest first.

---

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
