# context.md — Tenant Hub, current state
> Read this alongside CLAUDE.md. That file is the permanent briefing (product, architecture,
> hardening rules). This file is the snapshot: what is actually true right now, as of
> 2026-09-29, in this specific project's real accounts and deployments — not the plan, not
> the decision history (see DECISIONS.md for that), just where things stand today.

## Login still runs on Supabase Auth — do not assume otherwise
BUILD_PLAN C31 (own sessions) is under construction: password hashing, the new tables, and the
login/logout/password-reset API routes are built and tested (DECISIONS D26). **None of it is
live.** `/login` and `middleware.ts` are completely unchanged and still depend on Supabase Auth.
Two real blockers stand between "built" and "live" here: production has no `DATABASE_URL` (the
new routes need it, and setting it needs the same care as the rest of the Railway question —
see below), and `middleware.ts` runs on the Edge runtime, which can't hold a raw Postgres
connection the way the new session lookup needs. Don't wire the new routes into `/login` without
resolving both.

## The one thing to know before anything else
**Two separate infrastructure stacks currently exist, and they are not connected.**

1. **Production — Supabase + Vercel.** Real, live, in daily use by real staff at Ash Shahada /
   Matty's Place / Reliance. Real tenant data (NINo, addresses, support plans) lives here and
   nowhere else.
2. **Railway — Postgres + the worker.** Freshly provisioned this session. Schema-complete,
   verified, and running the worker for real — but empty. No tenant has ever been created here.

The web app (`app.mattysplace.org.uk`) reads and writes through Supabase exclusively, right now.
Nothing on Railway is wired into what staff actually use. Do not conflate "Railway exists and
works" with "we have moved off Supabase" — we have not.

## What's live on production right now
- URL: `https://app.mattysplace.org.uk` (Vercel project `tenant-hub-web`, `main` branch,
  auto-deploys on push).
- All of this session's UI/code work is live: the new console screens (Homes, Rent), the
  redesigned People/Settings/Reports/landing pages, the voice-intake fix, the confidentiality
  checkbox fix, the profile-photo save fix, the Next.js security patch (14.2.3 → 14.2.35).
- **Known broken on production right now:** the Homes and Rent screens show "couldn't load" —
  their underlying tables (`properties`, `tenancies`, `units`, and everything from migrations
  031–039) do not exist on the live Supabase database. The code is correct; the schema on that
  specific database is behind. Every other screen works as before.
- Same root cause, newly true after C33: the public `/report/[propertyId]`, the contractor
  `/jobs` page, and the new Trades panel on Repairs will all fail the same way on production —
  `trades`, `dispatch_jobs`, and `maintenance_tickets`' new columns are migration 036, also not
  on live Supabase yet. Not a new bug, just the same migrations gap reaching further.
- The eight agents (compliance-watch, rent-reconciliation, arrears-ladder, issue-triage,
  interaction-memory, owner-digest, regulation-watch, insurance-renewal) are **not running**
  against production. The worker that runs them isn't deployed anywhere near Supabase.

## What exists on Railway right now
- Project: **tenant-hub** (`dominicrume`'s Railway account, region sfo). Infra defined in
  `.railway/railway.ts` (pull the live state again with `railway config pull`).
- **Postgres service**: all 41 files in `supabase/migrations/` applied and verified (47 tables,
  including everything missing on the live Supabase project; certificate_types seeded, 20 rows).
  **042 (new this session, C33's RLS fix) is NOT applied here yet** — this environment's
  sandbox blocks piping a raw credential + connection string through a one-off script, which is
  the right call; apply it the same way the first 41 were (or however Rume prefers), then it's
  41 for 41 again.
  Reachable from outside Railway via a TCP proxy (`railway tcp-proxy list --service Postgres`
  shows the current host:port; the password is `PGPASSWORD` in `railway variables --service
  Postgres`, not written down anywhere in this repo).
- **worker service**: deployed from `Dockerfile.worker` (repo root) — deliberately not
  Railway's auto-detected build, which tries to build `apps/web` too and fails without real
  Supabase credentials at build time. Running with `DATABASE_URL` pointed at the Postgres
  service above. Registers all nine agents (chain-check + the eight integration agents) on
  boot. Since the database has zero organisations, it currently just idles — correctly, not
  an error.
- To redeploy the worker after a code change: `railway up --service worker --detach` from the
  repo root, then `railway logs --service worker --deployment --latest` to confirm it started
  cleanly.

## What it would actually take to move off Supabase (not done, not started)
This is real, sequenced work — see `docs/PLATFORM_CONSOLIDATION.md` for the fuller plan. In
short, all three of these need to happen, in roughly this order:
1. **Export the real Supabase data** and load it into the Railway database. Blocked: this
   environment has no Supabase CLI, no Supabase access token, and no direct database password
   for the *Supabase* side — only Railway's side is reachable right now.
2. **Move apps/web's data access off the Supabase JS client** and onto `packages/db` (the pg
   pool already used by `writeWithAudit`). Every API route currently does `auth.supabase.from(...)`
   — that's Supabase's REST layer + RLS, not something a `DATABASE_URL` swap alone changes.
3. **Replace Supabase Auth** with the app's own sessions (BUILD_PLAN.md C31: scrypt, httpOnly
   cookies, a rewritten middleware). Login and every authenticated request currently depends on
   Supabase Auth's JWT/cookie handling.

None of these is safe to start without explicit sign-off given the stakes (real data, real
logins, no rollback if rushed) — flag before touching any of them.

## What's needed from Rume to keep moving
- **A Supabase personal access token + the project's reference ID**, or the project's direct
  database password — either unlocks step 1 above (get one at
  supabase.com/dashboard/account/tokens, or the DB password under Project Settings → Database).
- **A decision on the migrations gap**: apply the same migrations (41 verified on Railway, plus
  042 from this session, not yet applied anywhere) to the *live* Supabase database — safe, every
  file is additive/idempotent — so Homes, Rent, and now the QR report/Jobs/Trades screens stop
  showing errors, independent of the bigger Railway cutover.
- **Stripe**: the billing tab's "Manage in Stripe" button fails because the live Supabase
  `organisations` row has no `stripe_customer_id`, *and* `STRIPE_SECRET_KEY` isn't set in
  Vercel at all. Confirmed with Rume that a real Stripe customer already exists; still need the
  secret key and that customer's ID to wire it up.

## Access already available in this environment (don't re-request these)
- `vercel` CLI — logged in, `tenant-hub-web` project linked.
- `railway` CLI — logged in, `tenant-hub` project linked.
- `gh` CLI — repo is `dominicrume/TENANT-HUB`, `main` is production, direct pushes to `main`
  are currently allowed (branch protection is set to require PRs but pushes are being bypassed
  with explicit authorisation each time — don't take that as blanket permission for future
  unrelated changes).

## Where to look for everything else
- `CLAUDE.md` — product, architecture, hardening rules, package topology. Read first, always.
- `docs/BUILD_PLAN.md` — the ordered commit plan (C01–C44). Continue from the first unticked one.
- `DECISIONS.md` — every non-obvious judgment call made along the way, newest first. D25 covers
  the Railway provisioning and env changes from this session in full detail.
- `docs/PLATFORM_CONSOLIDATION.md` — the actual Supabase→Railway migration plan this file's
  "what it would take" section is summarising.
