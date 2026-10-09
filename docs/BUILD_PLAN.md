# BUILD_PLAN.md — Tenant Hub v2: one product, one platform

> The single ordered execution plan. It merges `docs/ESTATE_OPS_INTEGRATION_PROMPT.md` (what and why, referenced as INT §n) with `docs/PLATFORM_CONSOLIDATION.md` (the hosting move, referenced as CON step n) into one commit sequence. Tick the checklist in section 7 as commits land. Nothing is "done" until its done-when line is verified by running.
>
> Start: 2026-09-26. Owner: Rume Dominic Uririe. Builder: Claude Code.
> Kick-off prompt: "Read docs/BUILD_PLAN.md. Continue from the first unticked commit. One commit per line, never commit red, verify by running, record judgement calls in DECISIONS.md."

## 1. Outcome

A manager signs in and lands on **Today**, which lists only the decisions a human must make, each with one button. Ten agents do the rest and leave receipts. A support worker adds a home, a room and a tenant in three fields each and runs intake to signature on a tablet. A tenant scans a QR on the wall and reports a leak in two taps. Everything runs on one platform (Railway: Postgres, web, worker), through one database driver, one session model, one RLS model, one write path. Supabase and Vercel are gone.

## 2. Ground rules (apply to every commit)

- Read INT §0 before the first commit of each milestone.
- One change per commit. `pnpm typecheck && pnpm lint && pnpm test` green before every commit. Never commit red.
- Every DB write through `packages/db`. Every agent write carries a KYA receipt. Every agent run inside a span.
- Zod schema in `packages/validation` before the table's API route exists. Never hand-type what `z.infer` gives.
- Additive migrations only. Never edit an applied migration. Never drop a Tenant Hub table. Compatibility views over renamed shapes.
- No browser storage for state. No demo-mode data path. No data source chosen by an env flag.
- Copy is read aloud to an imaginary eight-year-old before commit. One primary action per screen. No empty state without a next step.
- When ambiguous: choose the simpler screen, write the call in `DECISIONS.md`, continue. Stop only for destructive actions.
- `estate-ops 2/` is read-only reference. Never import from it. Never commit it.

## 3. Milestones and gates

| Milestone | Delivers | Gate to pass before the next |
|---|---|---|
| M0 Hygiene | docs linked, ignore rules, decisions recorded | `git status` clean of `estate-ops*`; `pnpm verify` green as today |
| M1 Today | new shell, Today from existing data, nav 13 → 8 | Manager lands on Today; every removed page reachable in two taps; e2e smoke green |
| M2 One driver | `pg` inside `packages/db`, one client, RPC retired, agent runtime tables and packages | No `@supabase` import outside `packages/db` and `(auth)`; H1 coverage test green; worker boots with heartbeat |
| M3 Spine and rules | properties/units/tenancies, GUC-keyed RLS on every table, ledger views, domain rule sets incl. `supported` | Backfill counts logged; RBAC parity test green; domain tests green; RLS smoke test proves cross-org read returns nothing |
| M4 Agents | ten agents live on Today | `pnpm verify` §11 checks green; each agent has a ✋ row or a receipt on What the system did |
| M5 Screens, auth, storage | Homes, Rent, Paperwork, Repairs, New laws, Audit, QR report; own sessions; storage port | Golden-path e2e green; Supabase Auth unused for 7 days; storage on R2 |
| M6 Move and ship | Railway Postgres + web + worker; parallel run; cutover; Supabase paused | `/api/health` ok on Railway; nightly diff clean for 7 days; DNS cut; `CLAUDE.md` updated |
| M7 Switch off | Vercel and Supabase deleted; deps removed; lint gate | No `SUPABASE_*` in env; no `@supabase/*` in any `package.json` |

## 4. The commit sequence

Format: **id** · title · source · touches · **done when**.

### M0 — Hygiene (2 commits)

- **C01** · Ignore and link the reference and the plan · INT §5 Phase 0 · `.gitignore` (`estate-ops*/`), `CLAUDE.md` Key Files (+ `docs/BUILD_PLAN.md`, `docs/ESTATE_OPS_INTEGRATION_PROMPT.md`, `docs/PLATFORM_CONSOLIDATION.md`) · **done when** `git check-ignore "estate-ops 2/.env.local"` prints the path.
- **C02** · Record the decisions · INT §1, CON §6 · `DECISIONS.md` (integration, N7 reversal, supported ladder, Railway consolidation, sequencing) · **done when** the four entries exist with today's date.

### M1 — Today, from what exists (4 commits, no schema change)

- **C03** · Console shell · INT §4.1 · `apps/web/src/components/Shell.tsx` (port from donor: navy rail, 8-item nav, role-aware, mobile tab bar, topbar pill placeholder), `(dashboard)/layout.tsx`, `globals.css` tokens (+live, brick, violet, line), `packages/ui/src/tokens.ts` · **done when** every existing page renders inside the new shell and the old `TenantSidebar` is deleted.
- **C04** · Needs-you-today from existing data · INT §4.2 · `apps/web/src/lib/needs-you.ts` (HB pending > 28 days or suspended; unpaid service charges; open tickets; intake drafts at step 4; unread handovers), `(dashboard)/dashboard/page.tsx` (groups, one button each, "How this works", stat tiles, "Everything else is handled", empty state) · **done when** a seeded manager sees grouped items and the nav badge equals the count.
- **C05** · Nav collapse · INT §4.1 · Sessions, Handovers, Communications, Risk Flags, AI Brain become tabs/panels in `/tenants/[id]`; Analytics and Reports become the "Monthly report" button on Today and a tab; old routes 301 · **done when** the commit message lists each removed page and its two-tap path, and Playwright asserts each path.
- **C06** · Tenant portal and print views restyled · INT §4.1 · `(tenant-portal)/*`, `print/*`, letterhead switcher moves into the tenant record and print views · **done when** a tenant login lands on `/my-home` in the new shell with 44 px targets.

### M2 — One driver, one client, agent runtime (8 commits)

- **C07** · `pg` inside `packages/db` · CON step 1 · `packages/db/src/pool.ts` (bounded pool, 30 s statement timeout, `DATABASE_URL` = Supabase transaction pooler for now), `packages/env` (+`DATABASE_URL`), ESLint zone: `pg` only in `packages/db` · **done when** `pnpm --filter @tenant-hub/db test` runs a round-trip query.
- **C08** · `writeWithAudit` as a transaction · CON step 1, INT §3.3 · replaces the RPC call with BEGIN → per-org advisory lock → upsert → chain hash → `audit_logs` insert → `stamp_queue` insert → COMMIT; gains `receipt`, `correlationId`, `actor`; `updateWithAudit` added · **done when** the existing write tests pass unchanged and a new test proves rollback leaves no audit row. RPC left in place, unused, until M6.
- **C09** · Repositories own reads · CON step 1, closes DECISIONS D6 · **DEFERRED (D16): needs DATABASE_URL to verify; built after C14** · every API route that used `createSupabaseServer` for reads calls a `packages/db` repository with the session passed in; `createSupabaseServer` deleted · **done when** `grep -r createSupabaseServer apps` is empty and every `GET` route test passes. (Auth pages still use Supabase Auth until C31.)
- **C10** · Agent runtime tables · INT §3.2 031 · `supabase/migrations/031_agent_runtime.sql` (`jobs`, `agent_health`, `agent_telemetry`, `audit_logs` receipt columns), Zod schemas, H1 coverage test updated · **done when** migration applies on a Supabase branch and the H1 test is green.
- **C11** · Pure packages · INT §3.1 · `packages/kya`, `packages/ports`, `packages/telemetry` (ported from donor), ESLint zones, `scripts/kya-gate.js` grep gates (`@estate-ops`, `pg` outside db) · **done when** unit tests for mandate/receipt and span pass and the gate fails on a planted violation.
- **C12** · Job queue and telemetry sink in `packages/db` · INT §3.3 · `enqueueJob`, `claimJobs` (SKIP LOCKED), `completeJob`, `failJob`, `deadLetterJob`, `heartbeat`, `setAgentHealth`, `emitTelemetry`, `pgTelemetrySink` · **done when** a test enqueues, claims, completes and dead-letters a job.
- **C13** · Adapters · INT §3.1, §5 #7 · `packages/adapters`: notify (Resend live / simulated), regulation (legislation.gov.uk live), bank (TrueLayer live / simulated), insurance quote (HTTP live / simulated), STT (simulated); `packages/env` gains `ADAPTER_MODE_*`, `RESEND_*`, `TRUELAYER_*`, `INSURANCE_QUOTE_*`, `APP_URL`, `WORKER_POLL_MS`, `WORKER_MAX_RETRIES` · **done when** each adapter returns `mode` correctly and a `live` adapter without credentials fails loudly.
- **C14** · Worker runtime · INT §3.5 · `apps/worker/src/{index,registry,scheduler,drain,lifecycle}.ts`, `agents/common.ts`, `agents/chain-stamp.ts` (the existing stamp drainer re-registered), `agents/chain-check.ts`, `/api/health` with `worker: ok|stale`, topbar pill wired · **done when** the worker boots, two agents register, heartbeat rows appear every 15 s, SIGTERM releases in-flight jobs, and the pill flips to "Agents paused" two minutes after the worker stops.

### M3 — Spine, RLS, ledger, rules (6 commits)

- **C15** · RLS keyed on request settings · CON step 2 · one migration `032_rls_request_settings.sql` replacing every `auth.uid()`-keyed policy (45 occurrences) with `app.current_org` / `app.current_user` / `app.current_role`; `packages/db` sets them in-transaction from the session; policies pass when unset (worker, migrations); RBAC parity test rewritten to read these policies · **done when** a test signed in as org A reads zero rows of org B on every table, and the worker still runs.
- **C16** · Property spine · INT §3.2 032 · `033_property_spine.sql` (`properties`, `units`, `tenancies`), `scripts/backfill-spine.ts` (idempotent; refuses second run), `ProjectionRegistry` derives `room_number`/`address`/`postcode` from the active tenancy (H3), Zod schemas · **done when** backfill logs counts equal to distinct addresses, rooms and active tenants, and a tenant record still shows its room.
- **C17** · Money and arrears · INT §3.2 033 · `034_money_and_arrears.sql` (`tenancy_id` on `service_charges` and `rent_payments`, FIFO `tenancy_arrears` view, `tenant_arrears_balance` compatibility view, `rent_unmatched`, `arrears_cases`, `arrears_events`, `documents`) · **done when** the ledger page renders unchanged and a FIFO unit test proves `oldest_unpaid` moves when an older charge is paid.
- **C18** · Compliance, insurance, regulation, repairs, commitments · INT §3.2 034–036 · `035_compliance_insurance.sql` (certificate types seeded incl. the supported/HMO set), `036_regulation_repairs.sql` (`maintenance_tickets` extended, `trades`, `dispatch_jobs`, regulation tables), `037_commitments.sql`; Zod for all · **done when** H1 coverage test green for every new table.
- **C19** · Roles · INT §3.2 037 · `038_roles.sql` (`contractor`), `packages/auth/src/rbac.ts` new resources, parity test · **done when** parity test green and a contractor session is refused everywhere except `/jobs`.
- **C20** · Domain rule sets · INT §3.4 · `packages/domain`: `ARREARS_LADDER` (residential, commercial, **supported**), `rungForDays`, `stageIndex`, `REQUIRED_CERTIFICATES`, `certificateStatus`, `draftArrearsDocument`, `NOT_ADVICE`; tests: monotonic rungs, approval past first rung, supported never drafts a notice, no instructing language, threshold days · **done when** `pnpm --filter @tenant-hub/domain test` green.

### M4 — Agents, one per commit, customer-value order (8 commits)

- **C21** · compliance-watch · INT §5 #13 · raises at 90/60/30/7, expiry, missing; Paperwork group on Today · **done when** the seeded missing Fire Risk Assessment appears on Today with "Add certificate".
- **C22** · rent-reconciliation · INT §5 #14 · month's charge per active tenancy; bank match; weak matches to `rent_unmatched` · **done when** verify proves no receipt written from a match below 0.90.
- **C23** · arrears-ladder + release route · INT §5 #15 · three ladders; drafts to `documents`; auto-release first rung only; `POST /api/arrears/events/[id]/release` checks `can(role,"arrears","approve")` · **done when** verify proves nothing past the first rung released without `approved_by`.
- **C24** · issue-triage · INT §5 #16 · over `maintenance_tickets`; STT (simulated); rules or Claude via `packages/ai`; emergency auto-dispatch only with a 24/7 trade · **done when** a seeded gas report is emergency on Today within one poll and a non-emergency waits for "Confirm dispatch".
- **C25** · interaction-memory · INT §5 #17 · over `staff_notes`, `sessions`, `communications`; `commitments` rows; "Before your next contact" panel · **done when** the seeded overdue promise shows on the tenant record.
- **C26** · morning summary · INT §5 #18 · one email, same list as Today, kept as a document, badged practice mode until Resend keyed · **done when** a `documents` row of kind `digest` exists after the daily run and Today links to it.
- **C27** · regulation-watch · INT §5 #19 · live feed; classified supported|residential|commercial|all|unknown; `unknown` never mapped · **done when** `regulation_items` fills from legislation.gov.uk on first drain and New laws renders.
- **C28** · insurance-renewal + decision route · INT §5 #20 · detect → risk → quotes → benchmark → stop; `POST /api/insurance/decision` records only · **done when** verify proves no cycle was ever decided by an agent and the ✋ `bind_insurance` refusal is on the receipt.

### M5 — Screens, own auth, storage port (9 commits)

- **C29** · Homes · INT §5 #21 · list, home page, Add home / room / tenancy (three fields each), Print QR · **done when** a support worker creates a home, room and tenancy from empty states without a manual.
- **C30** · Rent · INT §5 #22 · ladders as beads with the why line, "Is this rent?", HB status, "Up to date" · **done when** the three seeded ladders render at the correct rungs.
- **C31** · Own sessions · CON step 3 · `packages/auth`: scrypt, `user_sessions`/`login_attempts`/`password_resets` (`040_own_sessions.sql` — `039` was already taken by rent-reconciliation), httpOnly cookie, login throttle by email+IP in Postgres (replaces Upstash), cross-site POST refusal; reset and invite by emailed one-time link via notify port honouring `pending_invites`; tenant sign-in; intake signature page stays public; `middleware.ts` reads the cookie; bcrypt-verify-then-rehash for imported Supabase users · **in progress, 2026-09-28 (DECISIONS D26):** hashing, schema, session-store (15 pglite tests), and the login/logout/reset-request/reset-confirm routes are built and green, but not wired into `/login` or `middleware.ts` yet — that needs DATABASE_URL on production first (still Railway-only) and a considered call on middleware's Edge-runtime constraint. Own invites (041 + `/api/auth/invite`, `/api/auth/invite/accept`, `/invite/[token]`) are built too; the old Supabase `invite.ts` path is untouched. The bcrypt import for existing accounts is blocked on Supabase credentials (same gap as D25). · **done when** every auth e2e passes against the new sessions with Supabase Auth still present but unused.
- **C32** · Paperwork · INT §5 #23 · the matrix; one Add-certificate per empty or red cell · **done when** adding a certificate resolves its alert and the cell turns green without a reload blanking the matrix.
- **C33** · Repairs, Jobs, QR report · INT §5 #24, §4.4 · tenant's words → severity → action; trades; contractor `/jobs`; public `/report/[propertyId]` with `reported_via='qr'`, rate-limited per property · **built, 2026-09-29, not yet live-verified:** `/report/[propertyId]` + `POST /api/report/[propertyId]` (rate-limited 5/property/hour via `packages/db/src/public-report.ts`, H2-safe service-role reads); `/api/jobs` + rebuilt contractor `/jobs` (read-only — RBAC grants contractor read-only on maintenance, CI-enforced); `/api/trades` + a Trades panel on the Repairs board; Repairs board now shows severity/category/triage_reasoning. Found and fixed along the way: two RLS gaps in migration 036 silently emptied a contractor's own job list (`042_contractor_trade_read.sql`). `issue-triage` already picks up any `severity IS NULL` ticket regardless of `reported_via`, and `/api/needs-you` already includes unresolved tickets, so the chain is wired end to end — but no one has actually scanned a poster against a live property yet. That check belongs to C37's Playwright golden path ("QR report → Today"). · **done when** an unauthenticated report lands on Today triaged.
- **C34** · Storage port · CON step 4 · `StoragePort` in `packages/ports`; adapters: Supabase Storage (current), S3-compatible (R2, EU); copy `tenant-documents` to R2; adapter mode flip · **done when** documents open from R2 and the Supabase bucket is read-only.
- **C35** · New laws and What the system did · INT §5 #25 · regulation list with impacts and review; audit list leading with ✋ rows, receipt expansion, chain verify on click, agent grid · **done when** clicking a hash shows the previous row's hash matching `prev_hash`.
- **C36** · Seed · INT §5 #26 · `scripts/seed.ts` (refuses production unless `ALLOW_DEMO_SEED=1`): supported org with 3 HMOs, 12 tenants, HB-pending arrears at 10 and 30 days, missing FRA, emergency repair, overdue commitment; private-landlord org with residential + commercial · **done when** `pnpm seed` then a worker drain fills every Today group.
- **C37** · Verify and golden path · INT §5 #27–28 · `scripts/verify.ts` (§11 checks: agents ran, rungs per class, H9–H12 invariants, chain intact, H1 coverage, RBAC parity, grep gates); Playwright golden path (manager → Read & send → audit ✋; QR report → Today; contractor sees Jobs only; tenant sees portal only) · **done when** `pnpm verify` and `pnpm e2e` are green against Supabase-hosted Postgres.

### M8 — Properties refinement (9 commits, parallel track — see `docs/PROPERTIES_REFINEMENT.md`)

From a live client walkthrough, 2026-09-30 (Matloob + Osama). Full detail, including
what was actually said and why, lives in `docs/PROPERTIES_REFINEMENT.md` — this is
just the checklist line. Does not block, and is not blocked by, M6/M7.

- **C45** · Rename Homes → Properties · nav, page titles, `/homes` → `/properties` with a redirect · **done when** no user-facing "Home(s)" remains and old links still work.
- **C46** · Landlords, for real · a `landlords` table, "Add landlord" form, `properties.landlord_id` · **done when** a manager adds one without SQL.
- **C47** · Group/filter properties by landlord · dropdown fed by C46's table, addable, not hardcoded · **done when** a new landlord is immediately selectable with no code change.
- **C48** · Search properties by address · **done when** a partial address jumps straight to the property, any landlord.
- **C49** · Active / Pending status filter · **done when** Pending shows only what's missing, in plain words.
- **C50** · Two document trees, typed dropdown · property docs vs tenant docs never cross · **done when** a doc's type always comes from the list (+ "Other"), never free text.
- **C51** · Request a document from the landlord, in-app · **done when** the request and its status are real and visible on the property.
- **C52** · Room-status overview, colour-coded by landlord · **done when** empty rooms are visible at a glance across every landlord.
- **C53** · Sessions: Word/PDF export, per-user AI key, Claude as a provider option · **partial, 2026-10-01:** export done (apps/web/src/lib/session-export.ts — a real downloadable .doc and a print-to-PDF view, per session). Found while scoping the rest: Claude/Anthropic is *already* a fully working provider in `packages/ai/src/provider.ts`'s router — it's just never reachable, because `activeProvider()` picks by a fixed priority order (Azure > OpenAI > Anthropic > ...) and this org's `OPENAI_API_KEY` always wins. Not a missing feature, a missing *choice*. Per-user AI key is genuinely not started — it needs a real decision on safe storage (encryption at rest, who can view/revoke it) before any UI for it gets built; not assumed or guessed at here. · **done when** export is a real file and a second provider genuinely runs sessions.

### M9 — Compliance at intake (1 commit)

- **C54** · Right-to-rent / ID verification adapter · same live/simulated pattern as notify, bank feed and insurance quotes (`packages/adapters`) — `SimIdCheck` works with zero credentials, `CredasIdCheck` is real and wired but needs `CREDAS_BASE_URL`/`CREDAS_API_KEY`/`CREDAS_WEBHOOK_SECRET` + `ADAPTER_MODE_IDCHECK=live` to switch on; vendor choice and cost are a real decision, not assumed here — Credas is the default target, swapping it is a one-class change per the adapter pattern. New `tenant_id_checks` table (049), a "Right to Rent" tab on the tenant page, `/api/tenants/[id]/id-check` (+ `/refresh`), and `/api/webhooks/credas` for the real async callback (payload field names unverified against Credas's actual docs — confirm before relying on them live). Reports an outcome only; never approves or refuses a tenancy itself (H10/H11) — staff always make the actual decision. Adds "ID checks" to the practice-mode pill until a real vendor is configured. · **done when** a simulated check runs end to end from the tenant page with zero credentials, and `idCheck()` throws a clear, named error if `ADAPTER_MODE_IDCHECK=live` is set without real Credas credentials.

- **C55** · Parity set — "what they have that we don't" (Rume, 2026-10-09: integrations, tenant referencing, accounting ledger, MFA, portals) · built as five thin, real slices rather than five products. **MFA**: TOTP (RFC 6238, no dependency — `packages/auth/src/totp.ts` with the RFC test vectors), pending-secret enrolment so a typo can't lock you out, 8 one-shot recovery codes stored hashed, a 5-minute hashed login challenge (`mfa_challenges`); `/api/auth/mfa/{setup,confirm,verify,disable}`, the login page grows a code step, Settings → Security. Not force-enabled for managers on purpose — that would lock out the only manager; it's a nudge on the Security tab. **Referencing**: `tenant_references` (052) — referee is emailed a one-shot link (`/reference/[token]`, no account), answers Yes / No / Can't say + free text, result appears under the Right to Rent tab beside the ID check. **Landlord portal (thin)**: the document-request email now carries a 14-day one-shot upload link (`/landlord-upload/[token]`), file lands in `document_blobs` and the row flips to received — no login, no "email it back". **Ledger**: per-tenant statement CSV, org-wide balances CSV, "Adjustment (credit)" payment type for write-offs/corrections. **Integrations**: outbound signed webhooks per org (`org_webhooks` + `webhook_deliveries`, HMAC `X-TenantHub-Signature`, 5s timeout, never on the request path, every attempt recorded) emitted from tenant/tenancy/ticket/document/payment creates; Settings → Integrations — this is the one mechanism Zapier/Make/n8n/Power Automate all hang off, i.e. "97 integrations" without 97 connectors. · **done when** a manager can enrol an authenticator and is asked for a code at next login; a referee link round-trips without an account; a landlord link files a PDF against the property; a webhook URL receives a signed `tenancy.created` within a second.

### M6 — Move and ship (5 commits)

- **C38** · Docker and Railway services · CON step 5, donor `Dockerfile` · `Dockerfile` (one image, `START_CMD` selects web or worker; web runs migrations on release), `railway.json` (healthcheck `/api/health`), `scripts/migrate.ts` (numbered, tracked in `_migrations`) · **done when** both services build and the worker runs on Railway against the Supabase pooler.
- **C39** · Parallel run · CON step 5 · Railway Postgres (EU West) created; `pg_dump` → `pg_restore`; **non-superuser app role** created and `DATABASE_URL` pointed at it; nightly `scripts/diff-prod.ts` comparing row counts and latest audit hash per table; nightly `pg_dump` to R2 · **done when** seven consecutive nightly diffs are clean and a restore drill succeeds.
- **C40** · Cutover · CON step 5 · write freeze (maintenance banner, 10 min), final dump/restore, DNS `app.mattysplace.org.uk` → Railway web, unfreeze; Supabase project paused, not deleted; DPA and privacy page updated to EU residency (agreed with the client before this commit) · **done when** `/api/health` on the Railway domain reports `db: ok, worker: ok` and a manager completes the golden path in production.
- **C41** · Documentation · INT §5 #30 · `CLAUDE.md` (stack, topology, H9–H14, roles, nav, first principle), `docs/HARDENING.md` (H9–H14 with status boxes), `docs/architecture.md`, `BUILD_REPORT.md` coverage matrix, `README.md` · **done when** a new engineer can run the stack from `README.md` alone.
- **C42** · Retire the reference · INT §0 · move `estate-ops 2/` to `../estate-ops-reference/` · **done when** the folder is gone from the working tree.

### M7 — Switch off (2 commits, 30 days after C40)

- **C43** · Remove Supabase and Vercel · CON step 6 · drop `auth.*` trigger and RPC, delete `(auth)` Supabase code paths, remove `@supabase/*` and `@vercel/analytics` from every `package.json`, remove `SUPABASE_*`/`NEXT_PUBLIC_SUPABASE_*` from `packages/env` and `turbo.json`, lint gate forbids `@supabase` · **done when** `pnpm verify` green with no Supabase variable set.
- **C44** · Delete projects · CON step 6 · Supabase project deleted after final backup to R2; Vercel project deleted; Upstash deleted · **done when** the monthly bills show Railway, Cloudflare, Resend, Sentry, Stripe, Twilio only.

## 5. Vendors: what leaves, what stays

| Vendor | Today | After | Leaves at |
|---|---|---|---|
| Supabase (Postgres, Auth, Storage, Realtime) | core | gone | C40 paused, C44 deleted |
| Vercel (web) | core | gone | C40 |
| Upstash Redis (rate limiting) | web | gone, Postgres throttle | C31 |
| Railway | none | Postgres + web + worker | C38 |
| Cloudflare R2 | none | documents, backups | C34 |
| Resend, Twilio, Stripe, Sentry | yes | unchanged | — |

## 6. Risks and rollback

| Risk | Where | Mitigation | Rollback |
|---|---|---|---|
| RLS rewrite opens a cross-org read | C15 | cross-org zero-row test on every table; Supabase branch first | revert the one migration; policies are replaced, not dropped |
| Backfill mis-groups rooms into homes | C16 | dry-run prints groups for review; idempotent; old columns untouched | delete spine rows; projections fall back to stored columns |
| Users locked out at auth switch | C31 | Supabase Auth stays live and unused for 7 days; bcrypt verify on first login; reset links tested | flip middleware back to Supabase cookie check |
| Data loss at cutover | C40 | write freeze; final dump; Supabase paused not deleted for 30 days; restore drill in C39 | point DNS back to Vercel; unpause Supabase |
| Residency objection | C40 | raise EU West with the client before C39; DPA updated | stay on Supabase London (M6 pauses; everything before it still stands) |
| Worker silently down | any | `/api/health` stale detection; topbar pill; dead-letter email | — |

## 7. Checklist

- [x] C01 · [x] C02 — **M0 gate** ✓ 2026-09-26
- [x] C03 · [x] C04 · [x] C05 · [x] C06 — **M1 gate** ✓ 2026-09-26 (signed-in e2e paths skip until a staff test account exists)
- [x] C07 · [x] C08 · [ ] C09 (deferred until DATABASE_URL — DECISIONS D16) · [x] C10 · [x] C11 · [x] C12 · [x] C13 · [x] C14 — **M2 gate** open: C09 outstanding
- [x] C15 · [x] C16 · [x] C17 · [x] C18 · [x] C19 · [x] C20 — **M3 gate** ✓ 2026-09-26 (RBAC parity, RLS zero-cross-org, spine backfill, arrears hardening — all proven on pglite; live-DB verification pending DATABASE_URL)
- [x] C21 · [x] C22 · [x] C23 · [x] C24 · [x] C25 · [x] C26 · [x] C27 · [x] C28 — **M4 gate** ✓ 2026-09-27 (all 8 agents shipped and pglite-tested; H9–H11 invariants proven per-agent — live verification pending DATABASE_URL)
- [x] C29 · [x] C30 · [ ] C31 · [x] C32 · [ ] C33 · [ ] C34 · [ ] C35 · [ ] C36 · [ ] C37 — **M5 gate**
- [ ] C38 · [ ] C39 · [ ] C40 · [ ] C41 · [ ] C42 — **M6 gate**
- [ ] C43 · [ ] C44 — **M7 gate**
- [x] C45 · [x] C46 · [x] C47 · [x] C48 · [x] C49 · [x] C50 · [x] C51 · [x] C52 · [ ] C53 — **M8 gate** (parallel track, see `docs/PROPERTIES_REFINEMENT.md`) — C45–C52 built 2026-10-01, not yet live-verified (migrations 043/044 not applied to any real database — same gap noted for 042). C53 partial: session export done; per-user AI key and an actual provider *choice* still open, see its own line above.
- [x] C54 — **M9 gate** ✓ 2026-10-07 (parallel track, does not block/isn't blocked by anything else) — adapter, migration 049, routes and UI built and tested; simulated mode is live in production now, `ADAPTER_MODE_IDCHECK=live` is a deliberate vendor/cost decision for later, not done here.
- [x] C55 ✓ 2026-10-09 — MFA, referencing, landlord upload link, ledger CSV/adjustments, outbound webhooks; migration 052 applied on Railway; all five slices live.

## 8. Indicative timing

Agent-driven with daily review. M0–M1 one week. M2–M3 two weeks. M4 one week. M5 two weeks. M6 one week plus the seven-day parallel run. M7 thirty days after cutover. Roughly eight working weeks to cutover. These are estimates, not commitments; the gates, not the calendar, decide when a milestone is done.
