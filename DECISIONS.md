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
