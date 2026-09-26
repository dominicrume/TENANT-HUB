# MASTER BUILD PROMPT — Fold Estate Ops into Tenant Hub

> Paste this into Claude Code from the Tenant Hub repo root, or say:
> "Read docs/ESTATE_OPS_INTEGRATION_PROMPT.md and execute it phase by phase. Verify by running. Commit one change at a time."

---

> **Platform note (2026-09-26):** the hosting decision (leave Supabase and Vercel, consolidate on Railway) is in `docs/PLATFORM_CONSOLIDATION.md`. Its Step 1 (swap `@supabase/supabase-js` for `pg` inside `packages/db`, one client for reads and writes) must land **before** Phase 2 below so the agent runtime is written once against plain Postgres. Its Step 2 (RLS keyed on `app.current_org`, not `auth.uid()`) lands as the first migration of Phase 3. Where this brief says "Supabase", read "Postgres" and follow the consolidation doc's sequencing.

## 0. Read first, in this order

1. `CLAUDE.md` (Tenant Hub rules H1–H8, package topology, tokens, Never-Do list)
2. `docs/HARDENING.md`, `docs/architecture.md`, `DECISIONS.md`
3. `estate-ops 2/CLAUDE.md`, `estate-ops 2/docs/UX_FIRST.md`, `estate-ops 2/docs/HARDENING_RULES.md`, `estate-ops 2/design/DESIGN_SYSTEM.md`
4. `estate-ops 2/BUILD_REPORT.md` and `estate-ops 2/DECISIONS.md` (what was built, what was verified, what judgement calls were made)
5. `estate-ops 2/packages/domain/src/index.ts`, `estate-ops 2/packages/kya/src/index.ts`, `estate-ops 2/packages/ports/src/index.ts`
6. `estate-ops 2/apps/worker/src/*` and `estate-ops 2/apps/worker/src/agents/*` (the nine agents)
7. `estate-ops 2/apps/web/src/lib/needs-you.ts`, `apps/web/src/app/(dashboard)/dashboard/page.tsx`, `apps/web/src/components/Shell.tsx`
8. `estate-ops 2/design/estate-ops-ui.html` — open it in a browser. This is the visual target.

The `estate-ops 2/` folder is **reference source only**. It is untracked, it must stay untracked, and nothing in Tenant Hub may ever `import` from it. Its `.env.local` holds live secrets (a Railway `DATABASE_URL`, `SESSION_SECRET`, an `OPENAI_API_KEY`); the repo `.gitignore` already ignores `.env*`, confirmed. When Phase 7 is done, move the folder to `../estate-ops-reference/` outside this repo.

---

## 1. What we are doing and why

**Estate Ops** is a finished, deployed product (Railway, 27/27 verify, 6/6 e2e) for a private landlord with residential and commercial property. Its thesis: *the system acts, the human only decides what only a human can decide.* Nine mandated agents work beneath an operations console that opens on **"Needs you today"**.

**Tenant Hub** is the supported-housing platform for Matty's Place / Ash Shahada / Reliance: the five-step intake pipeline with tenant signature bound to a canonical hash, the append-only audit chain with async blockchain stamp, RBAC mirrored by RLS, the tenant portal.

We are bringing Estate Ops's **capabilities** into Tenant Hub as a forward integration. Tenant Hub is the product. Estate Ops is the donor. We do **not** run two apps, two databases or two data paths (that is H7). We port:

| From Estate Ops | Into Tenant Hub as |
|---|---|
| Agent runtime (jobs, scheduler, drain, heartbeat, health, telemetry, dead-letter) | `apps/worker` grows from a stamp drainer into the agent runtime; the stamp drain becomes one registered agent |
| KYA mandate + receipt (sources read, refusals, outcome) | new pure package `packages/kya`; receipt fields added to `audit_logs` |
| Ports and adapters with `live`/`simulated` mode, badged on screen | new packages `packages/ports` and `packages/adapters` |
| Asset-class rule sets (arrears ladders, required certificates, drafts) | `packages/domain` gains a **third** rule set: `supported` (see 3.4) |
| Property → units → tenancies spine | additive migrations; existing `tenants` rows become tenancies in rooms of a property |
| "Needs you today" console + nav collapse | the new Tenant Hub dashboard and shell |
| Nine agents | ported one at a time, each through `writeWithAudit`, each with a receipt, each inside a span |

**One rule reverses.** Estate Ops rule N7 forbade anything from the supported-housing domain crossing *into* Estate Ops. That gate protected a standalone product. It does not apply in this direction. Delete the N7 grep gate from your thinking. Everything else in N1–N6 becomes a Tenant Hub hardening rule (H9–H14, section 3.6).

---

## 2. The first principle, and how it decides every argument

**Stupidly simple. Work back from the customer to the technology.** A busy support worker on a tablet, a housing manager on a phone, a vulnerable tenant on the wall QR code: an eight-year-old must be able to use every screen without being taught. Steve Jobs: remove everything inessential.

Rules that follow from it (from `UX_FIRST.md`, now Tenant Hub law):

1. **One primary action per screen.** The next step is always obvious.
2. **No empty state without a next step.** "No homes yet → Add your first home."
3. **No jargon on any human-facing surface.** "Gas certificate runs out in 12 days", never `alert_kind: expiring_30`. Sentence case. Plain words.
4. **The system proposes, the human disposes.** Irreversible actions show what will happen and ask first. Nothing is sent, bought, signed or served without a named person pressing the button.
5. **Provenance is visible.** LIVE and SIMULATED badges. "Entered by / when" on records. "Why" panels on every decision card.
6. **Speed is UX.** Render what you have, refine in place. A background refresh never blanks a populated list (H8).
7. **Errors are human.** A calm message, a reference the user can quote, a way forward. Never a stack trace.
8. **The dashboard opens on only what needs the human**, then says "Everything else is handled." That calm daily ritual is the product.

When a design question has two answers, choose the one with fewer things on screen.

---

## 3. Target architecture

### 3.1 Package topology after integration (one-directional, lint-enforced)

```
apps/web          ← Next.js console + tenant portal + public report page + API routes
apps/worker       ← agent runtime: registry · scheduler · drain · heartbeat · stamp agent

packages/env          ← ONLY reader of process.env (gains ADAPTER_MODE_*, WORKER_*, RESEND_*, TRUELAYER_*, INSURANCE_QUOTE_*, APP_URL)
packages/validation   ← Zod schemas for EVERY new table (properties, units, tenancies, certificates, policies, cycles, quotes, regulation, arrears, trades, dispatch, commitments, documents, jobs, agent_health, agent_telemetry)
packages/audit        ← SHA-256 chain (unchanged; AuditEntry gains agent/sources_read/refusals/outcome/correlation_id)
packages/kya          ← NEW. AgentMandate, ActionReceipt, assertMayRead/assertMayDo. Pure. No infra.
packages/ports        ← NEW. RegulationFeedPort, InsuranceQuotePort, BankFeedPort, SttPort, NotifyPort, LLMPort. Types only.
packages/adapters     ← NEW. legislation.gov.uk (live), Resend, TrueLayer, HTTP quote endpoint, simulated fallbacks. Reads env via packages/env only.
packages/telemetry    ← NEW. Structured logger + span(). TelemetrySink interface. No DB import (sink is injected from packages/db).
packages/domain       ← Tenant aggregate + ProjectionRegistry + NEW rule sets: ARREARS_LADDER, REQUIRED_CERTIFICATES, certificateStatus, draftArrearsDocument, rungForDays
packages/intake-core  ← XState machine (unchanged)
packages/ai           ← gains triageIssue, summariseInteraction, classifyRegulation (rules fallback when no key); DB via injected port ONLY (H2)
packages/ui           ← design system, presentational only; tokens gain live/brick/violet/line
packages/auth         ← RBAC matrix gains resources + the contractor role; RLS parity test extended
packages/db           ← THE ONLY writer. writeWithAudit gains receipt + correlationId + actor; job queue functions; pgTelemetrySink
packages/blockchain   ← unchanged (stamp stays async, H6)
```

ESLint zones to add (a violation is a build failure):
- `kya`, `ports`, `telemetry`, `validation`, `audit`, `env` import no infrastructure.
- `adapters` may import `ports`, `env`, `validation` only.
- `ai` may import `ports`, `validation`, `audit` only. Never `adapters`, never `@supabase`, never `next`.
- `apps/worker` may import `db`, `kya`, `domain`, `ports`, `adapters`, `ai`, `telemetry`, `validation`, `env`, `blockchain`. Never `ui`, never `next`.
- `pg` is imported only inside `packages/db` (consolidation Step 1 makes it the one driver).
- No `@estate-ops/*` import anywhere. Add a grep gate to `scripts/kya-gate.js`.

### 3.2 Data model: additive, non-destructive, one ledger

All migrations go in `supabase/migrations/`, numbered from `031`. Every new table: `org_id NOT NULL`, RLS on, policies keyed on the per-request settings `app.current_org` / `app.current_user` / `app.current_role` (consolidation Step 2 lands as the first migration of Phase 3 and rewrites the existing JWT-keyed policies to the same shape), and **H1 audit coverage** (the CI test `{tables written} == {tables with audit coverage}` must pass).

**031_agent_runtime.sql**
- `jobs` (org_id, job_type, payload, status enum pending|processing|done|failed|dead_letter|cancelled, retry_count, max_retries, dedupe_key, correlation_id, error, scheduled_at, next_retry_at, started_at, finished_at). Unique partial index on `(org_id, dedupe_key)` for pending/processing. Poll index on `(status, scheduled_at)`.
- `agent_health` (agent PK, state enum idle|running|failed|halted, last_heartbeat_at, last_run_at, last_success_at, last_error, consecutive_failures). Global, not per org.
- `agent_telemetry` (org_id nullable, agent, event, level, correlation_id, duration_ms, fields JSONB). Index `(agent, created_at DESC)`.
- `audit_logs` gains nullable columns: `org_id` (if absent), `agent TEXT`, `sources_read JSONB`, `refusals JSONB`, `outcome TEXT`, `correlation_id TEXT`. Append-only rules from 023 stay. `writeWithAudit` stores them in the same transaction (the `write_with_audit` RPC is retired in consolidation Step 1).
- RLS: `jobs`/`agent_telemetry` readable by manager/admin of the org; `agent_health` readable by all staff; writes only via service role (worker and RPC).

**032_property_spine.sql**
- `properties` (org_id, name, address_line1, city, postcode, asset_class enum residential|commercial|mixed|supported, floors, rebuild_value, acquired_on, notes).
- `units` (org_id, property_id, reference, unit_class enum residential|commercial|supported, floor, bedrooms, status enum occupied|vacant|refurbishment|held).
- `tenancies` (org_id, unit_id, tenant_id → tenants.id, tenancy_type enum ast|licence|commercial_lease|company_let|supported_licence, start_date, end_date, rent_amount, rent_frequency, rent_due_day, status enum draft|active|ending|ended).
- **Backfill** (idempotent, in the same migration or `scripts/backfill-spine.ts` run once): one `properties` row per distinct `(org_id, address, postcode)` on existing `tenants`, `asset_class='supported'`; one `units` row per distinct `room_number`, `unit_class='supported'`; one active `tenancies` row per active tenant, `rent_amount` from that brand's `settings.service_charge_default`, `start_date = moved_in`. Log a count of rows created; refuse to run twice.
- `tenants.room_number` / `address` / `postcode` remain as **projections** derived from the active tenancy (H3). Do not write them from two places: `ProjectionRegistry` derives them.

**033_money_and_arrears.sql**
- Do **not** create `rent_charges` / `rent_receipts`. Tenant Hub already has `service_charges` (charges) and `rent_payments` (receipts). Add `tenancy_id` (nullable, backfilled) to both.
- Replace the view `tenant_arrears_balance` with `tenancy_arrears` (tenancy_id, tenant_id, org_id, balance, oldest_unpaid) using **FIFO allocation**: `oldest_unpaid` is the oldest charge not covered by cumulative receipts, not the oldest charge ever raised. Keep `tenant_arrears_balance` as a thin compatibility view over it so nothing breaks.
- `rent_unmatched` (a payment the bank feed could not confidently match; status pending|confirmed|dismissed). Never mark paid on a weak match.
- `arrears_cases` (tenancy_id, opened_on, stage, balance_at_open, closed_on) and `arrears_events` (case_id, stage, action, generated_document_id, requires_approval, approved_by, approved_at, released_at).
- `documents` (org_id, kind, title, body, related_table, related_id, is_simulated). Drafted letters and the morning summary live here so the human can always read what was, or would have been, sent.

**034_compliance_and_insurance.sql**
- `certificate_types` (name, default_validity_months, applies_to unit_class, statutory_reference) seeded with the residential set, the commercial set, and the **supported/HMO set** (Gas Safety CP12, EICR, EPC, Fire Risk Assessment, Fire alarm & emergency lighting test, Smoke & CO alarms, Legionella, HMO licence, PAT testing).
- `certificates` (org_id, property_id, unit_id nullable, certificate_type_id, issued_on, expires_on, document_url).
- `compliance_alerts` (org_id, property_id, certificate_name, kind enum expiring_90|60|30|7|expired|missing, expires_on, raised_at, resolved_at). Unique open alert per (property, certificate, kind).
- `insurance_policies`, `insurance_renewal_cycles` (status detected → risk_assembled → quotes_gathered → awaiting_decision → decided|lapsed; decision accept|decline|defer), `insurance_quotes` (is_simulated NOT NULL).

**035_regulation_and_repairs.sql**
- `regulation_sources`, `regulation_items` (unique (org_id, external_id); applies_to enum residential|commercial|supported|all|unknown; classified_by_model), `regulation_impacts`.
- Extend `maintenance_tickets` (do **not** create `maintenance_issues`): add `property_id`, `unit_id`, `reported_via enum portal|phone|voice|email|inspection|qr`, `raw_report`, `transcript`, `category`, `severity enum emergency|urgent|routine|cosmetic`, `triage_reasoning`. Map existing `status` text onto new|triaged|dispatched|in_progress|resolved|closed with a CHECK.
- `trades` (org_id, name, category, contact_email, contact_phone, is_emergency_capable) and `dispatch_jobs` (ticket_id, trade_id, dispatched_at, completed_at, cost).

**036_interactions.sql**
- Do **not** create a parallel `interactions` table. `staff_notes`, `sessions` and `communications` are the interaction record. Add `summary TEXT` and `channel` where missing.
- `commitments` (org_id, tenant_id, source_table, source_id, text, owner enum landlord|tenant|contractor|support_worker|council, due_on, status open|done|overdue). One row per promise so "Before your next contact" is a query, not a JSON scan.

**037_roles.sql**
- Add `contractor` to `user_role`. Contractors see only `/jobs` (their dispatched repairs). Update `PERMISSIONS` in `packages/auth/src/rbac.ts` with the new resources (`properties, tenancies, rent, arrears, compliance, insurance, regulation, maintenance, interactions, agents`) and the parity test.

Role mapping from Estate Ops: owner → `admin`, manager → `manager`, agent → `support_worker`, contractor → `contractor`, viewer → not needed.

### 3.3 The single write path

`packages/db/src/write-with-audit.ts` gains:

```ts
receipt?: ActionReceipt;     // from packages/kya — agent, sources_read, refusals, outcome
correlationId?: string;
actor?: { id?: string; name?: string; role?: string };  // absent for agents → user_name = "System · <agent>"
```

`writeWithAudit` writes these on `audit_logs` inside one `pg` transaction with a per-org advisory lock, ported from Estate Ops (the RPC is retired in consolidation Step 1). The `prev_hash` chain remains per organisation. The stamp enqueue stays in the same transaction (H6). Add to `packages/db`: `enqueueJob`, `claimJobs(limit)`, `completeJob`, `failJob`, `deadLetterJob`, `heartbeat(agent)`, `setAgentHealth`, `emitTelemetry`, and export `pgTelemetrySink` implementing `TelemetrySink` from `packages/telemetry`. All of these use the `pg` pool, which is importable only inside `packages/db`. H2 is reframed, not weakened: the only privileged database connection in the monorepo lives in `packages/db`, and every request sets `app.current_org` so RLS bites even there once the app role is a non-superuser.

### 3.4 Domain rules: asset class selects the rule set, in code

Port `ARREARS_LADDER`, `rungForDays`, `stageIndex`, `REQUIRED_CERTIFICATES`, `certificateStatus`, `draftArrearsDocument`, `NOT_ADVICE` into `packages/domain`. Then add the third class the donor never had:

```ts
supported: [
  { day: 7,  stage: "check_in",       action: "support_worker_check_in", requiresApproval: false, label: "Check in" },
  { day: 14, stage: "hb_chase",       action: "draft_council_hb_query",  requiresApproval: true,  label: "Chase housing benefit" },
  { day: 28, stage: "support_plan",   action: "draft_support_plan_note", requiresApproval: true,  label: "Support plan review" },
  { day: 56, stage: "formal_letter",  action: "generate_letter",         requiresApproval: true,  label: "Formal letter" },
  { day: 90, stage: "manager_review", action: "draft_manager_brief",     requiresApproval: true,  label: "Manager review" },
]
```

A vulnerable tenant in supported housing is in arrears most often because a Housing Benefit or Universal Credit claim is pending or suspended. The Estate Ops residential ladder (reminder → formal letter → solicitor → notice) would be the wrong tool. The supported ladder's first three rungs are conversations and council queries, never letters to the tenant. No rung on the supported ladder ever drafts a notice. Unit tests must prove: no stage past `check_in` releases without approval; no supported rung produces instructing legal language; the not-advice footer is on every draft.

Carry over these donor judgement calls unchanged (from `estate-ops 2/DECISIONS.md`):
- The ladder is chosen by the **unit's** class. A mixed property has more than one ladder.
- `oldest_unpaid` is FIFO. A rung can move down when an older charge is paid: the case closes and reopens at the right rung.
- A bank match below 0.90 confidence is queued for a person. The agent never writes a receipt for it.
- Regulation items classified `unknown` are stored but never mapped to properties. The human reviews them.
- Date arithmetic is UTC everywhere.

### 3.5 Agent runtime

`apps/worker/src/` becomes: `index.ts` (register agents, start heartbeat, poll loop, graceful shutdown), `registry.ts`, `scheduler.ts` (enqueue each scheduled agent per org when its interval has elapsed; dedupe by `agent:bucket`; hand back jobs stuck `processing` > 30 min; skip orgs younger than 2 minutes), `drain.ts` (claim ≤ 5 with `FOR UPDATE SKIP LOCKED` semantics via an RPC, run inside `span()`, complete | retry with 2/4/8 min backoff | dead-letter and email the manager), `lifecycle.ts` (heartbeat every 15 s, SIGTERM waits ≤ 20 s for in-flight jobs then releases them), `agents/common.ts` (`mandate()`, `read()`, `refuse()`, `receipt()`, `notify()`, `orgBrand()`, `managerEmail()`).

The existing stamp drainer is re-registered as `agents/chain-stamp.ts` with a mandate of `mayRead: ["stamp_queue"]`, `mayNeverDo: ["move_money"]`. H6 holds: nothing on the HTTP request path awaits a stamp or an agent.

Every agent: `async fn(payload, orgId, correlationId)`. Every side effect through `writeWithAudit` with the receipt. Every run inside `span(pgTelemetrySink, ...)`. Every refusal recorded on the receipt as a ✋ row, which the audit screen leads with.

Deployment: the worker is a long-running Node process. Run it on Railway with `DATABASE_URL` pointing at the **same** Postgres as the web app (the Supabase pooler until consolidation Step 5, Railway Postgres after). One database, one data path. Add `/api/health` reporting `db: ok|down` and `worker: ok|stale` (stale = no heartbeat for 2 minutes), and the topbar pill "System live / Agents paused" reads it. The pill is not decorative.

### 3.6 Hardening rules H9–H14 (Estate Ops N1–N6, now Tenant Hub law)

Add to `docs/HARDENING.md` and `CLAUDE.md`:

- **H9** No simulated action presented as real. Every adapter declares `mode`. Simulated data ships a visible badge. `is_simulated` is NOT NULL wherever it exists.
- **H10** The system never buys, pays, binds cover, or moves money. Insurance ends at a decision card. Those verbs do not exist in the ports.
- **H11** The system never sends a legal notice or a formal letter by itself. Past the first rung, every arrears event blocks on a recorded human approval (`approved_by`, `approved_at`), and the release route checks `can(role, "arrears", "approve")`.
- **H12** Every automated action is audited via `writeWithAudit` with a KYA receipt (sources read, refusals, outcome). No silent agent work. A daily `chain-check` agent recomputes every hash.
- **H13** Asset class selects rule sets, ladders and certificate sets **in code** (`packages/domain`), never in a config table, never hard-coded in a screen.
- **H14** Generated text is informational only, never legal or financial advice. Every draft ends with the not-advice line. A unit test forbids instructing language.

---

## 4. The console: what the customer sees

### 4.1 Navigation collapses from 13 items to 8

Current Tenant Hub nav: Dashboard, Tenants, Sessions, Ledger, Maintenance, Handovers, Communications, Audit Log, Risk Flags, Analytics, Reports, AI Brain, Settings. That is a filing cabinet. The new shell, matching `estate-ops-ui.html`:

| Nav label | Route | What folds into it |
|---|---|---|
| Today | `/dashboard` | Needs you today · Everything else is handled · Your agents right now |
| People | `/tenants` | tenant list and record; Sessions, Handovers, Risk Flags, Communications, AI Brain live **inside** the tenant record as tabs and inline panels |
| Homes | `/homes` | properties → rooms/units → tenancies; certificates per home; insurance per home |
| Rent | `/rent` | ledger, arrears ladders drawn as beads, "Is this rent?" queue, Housing Benefit status |
| Repairs | `/maintenance` | tenant's words → severity → action, one line each; trades |
| Paperwork | `/compliance` | the certificate matrix, homes × certificate types, one "Add certificate" per empty cell |
| New laws | `/regulation` | live legislation feed mapped to your homes; `unknown` shown for review |
| What the system did | `/audit` | audit chain, KYA receipts, ✋ boundary rows, agent health |

Footer: avatar, role label ("Manager access"), Settings gear (brand, people, connections, forms), sign out. Mobile tab bar: Today · People · Rent · Repairs · Log. "Reports" and "Analytics" become a button on Today ("Monthly report") and a tab inside Homes; they are outputs, not destinations. Insurance is a section of Homes and a group on Today, not a nav item, because a housing association decides on it a few times a year.

Contractors get one screen: `/jobs`. Tenants get the portal they already have (`/my-home`, `/my-ledger`, `/report-issue`), restyled to the same shell, plus the no-login QR page below.

### 4.2 Today: the hero

Port `needs-you.ts` and the dashboard from Estate Ops, then add the supported-housing groups. Groups render in cost order, emergencies first, each item with a title in plain words, one line of detail, and **one** button:

| Group | Source | Button |
|---|---|---|
| Repairs | tickets triaged emergency with no 24/7 trade; tickets awaiting dispatch confirmation | Send a trade now · Confirm dispatch |
| Letters and queries to send | `arrears_events` requiring approval, not released | Read & send |
| Housing benefit | tenants with HB pending > 28 days or suspended (from the existing housing-benefit fields) | Chase the council |
| Sign-offs | intake drafts at step 4 awaiting the tenant's signature; handovers unread | Get the signature · Read handover |
| Money in | `rent_unmatched` pending | Yes, it's rent · Not rent |
| Insurance | cycles `awaiting_decision` | Review & decide |
| Paperwork | `compliance_alerts` missing or expired | Add certificate |

Above the list: the three-line "How this works" strip (The system watches · It writes the next step · You press the button). Below it: four stat tiles (Rent this month, Outstanding, Certificates, New laws), the green "Everything else is handled" tick with the one-sentence summary of what the agents did, and the agent grid (name, state, last run, actions today). If the list is empty: "You're clear. Come back tomorrow, or look around while the agents work." The nav badge on Today is the count.

The morning summary (owner-digest agent) is the same list as an email at 7 a.m., kept as a document, labelled "email is in practice mode" until Resend is keyed.

### 4.3 Screen rules (every screen, no exceptions)

- Server components for reads where possible. `useTenants()` stays the single source of truth for tenant lists (H8). Populated lists never blank on refresh.
- Design tokens only: navy `#0F1C2E`, amber `#E8A84C` (spent only where a decision or action lives), cream, surface, plus the donor's live green `#2E9E6B`, brick `#B24A31` (money owed, emergencies), violet `#6B5BD1` (receipts), line `#E9E1D4`. Put them in `packages/ui/src/tokens.ts` and `globals.css`. No Tailwind `red-*`/`blue-*` in branded components.
- Sora for everything. JetBrains Mono only for hashes, receipts and timestamps.
- Asset class tags everywhere a home or room appears: supported (amber), residential (green), commercial (violet).
- LIVE / SIMULATED badge wherever adapter data appears. "Classified by rules" vs "classified by Claude" is said on screen.
- Every decision card has a "Why" panel: inputs, sources read, the ✋ refusal, the receipt hash.
- 44 px minimum touch targets on phone, 56 px on the tablet intake (existing rule). Focus rings. Reduced motion respected. Motion only to answer an action or show an agent is live.
- Copy: sentence case, no jargon, no status enums on screen. "Gas certificate runs out in 12 days." "Two tenants are behind. Each one shows how late they are and the next step, already written. You just press send."

### 4.4 The eight-year-old surfaces

- **Report a problem, no login:** `/report/[propertyId]`. One question ("What's happening?"), one optional room picker, one button. Printed as a QR code on the noticeboard of every home (Settings → Homes → Print QR). Feeds `maintenance_tickets` with `reported_via='qr'`; issue-triage runs within the hour. "If there is danger to life, call 999 first."
- **Add a home:** name, address, postcode, type (supported / residential / commercial). Three fields. Rooms and tenancies are added from the home's page, each in three fields.
- **Add a certificate:** appears on the empty cell it fills. Type is pre-chosen. Two dates and an optional photo.
- **Intake pipeline:** unchanged. It already is the model.

---

## 5. Build order (one commit each, never commit red)

Work from the customer inward. Phase 1 needs no schema and ships the hero.

### Phase 0 — Hygiene (1 commit)
- Confirm `estate-ops 2/` is untracked and ignored. Add `estate-ops*/` to `.gitignore` explicitly.
- Add this document to `docs/`, link it from `CLAUDE.md` under "Key Files".
- `DECISIONS.md`: record the integration decision, the N7 reversal, and the supported ladder.

### Phase 1 — Today, from what exists (3 commits)
1. New shell: `apps/web/src/components/Shell.tsx` ported from the donor (navy rail, 8-item nav, role-aware, mobile tab bar, topbar pill), replacing the topbar + `TenantSidebar` layout. Tenant list moves into `/tenants`. Letterhead switcher moves to the tenant record and print views.
2. `apps/web/src/lib/needs-you.ts` built on **existing** Tenant Hub data: HB alerts (existing analytics), unpaid service charges, open tickets, intake drafts awaiting signature, unread handovers. Dashboard replaced by the Today page.
3. Nav collapse: Sessions, Handovers, Communications, Risk Flags, AI Brain become tabs/panels inside `/tenants/[id]`. Analytics and Reports become the "Monthly report" button and a Homes tab. Old routes 301 to their new homes. Every removed page's function must still be reachable in two taps; list them in the commit message.

### Phase 2 — Agent runtime (5 commits)
4. `031_agent_runtime.sql` + `audit_logs` receipt columns + Zod schemas + H1 coverage test green.
5. `packages/kya`, `packages/ports`, `packages/telemetry` (pure), ESLint zones, `kya-gate` grep for `@estate-ops` and `pg`.
6. `packages/db`: `writeWithAudit` receipt/correlationId/actor; job queue functions; `pgTelemetrySink`.
7. `packages/adapters`: notify (Resend live / simulated), regulation (legislation.gov.uk live), bank (TrueLayer live / simulated), insurance quote (HTTP live / simulated), STT (simulated). `packages/env` gains the variables. Simulated is the default for everything except regulation.
8. `apps/worker` runtime: registry, scheduler, drain, lifecycle; `chain-stamp` agent re-registered; `chain-check` agent added; `/api/health` reports worker heartbeat; topbar pill wired.

### Phase 3 — Spine and rules (4 commits)
9. `032_property_spine.sql` + backfill + `ProjectionRegistry` derives `room_number`/`address` from the active tenancy.
10. `033_money_and_arrears.sql`: `tenancy_id` on ledger tables, FIFO `tenancy_arrears`, compatibility view, `rent_unmatched`, `arrears_cases/events`, `documents`.
11. `034`, `035`, `036`, `037` migrations + Zod schemas + RBAC matrix + parity test.
12. `packages/domain` rule sets including `supported`, with unit tests (ladder monotonic, approval past first rung, no instructing language, certificate status thresholds).

### Phase 4 — Agents, one per commit, in customer-value order (8 commits)
13. **compliance-watch** — Matty's Place is HMOs: gas, electrics, fire. Raises at 90/60/30/7, on expiry, on missing. Paperwork group on Today lights up.
14. **rent-reconciliation** — raises the month's charge per active tenancy from `rent_amount`; matches bank feed (simulated until TrueLayer is keyed); weak matches to "Is this rent?".
15. **arrears-ladder** — supported / residential / commercial ladders; drafts to `documents`; auto-releases only the first rung; everything else waits for "Read & send". Release route `POST /api/arrears/events/[id]/release` checks role and records `approved_by/approved_at/released_at` via `writeWithAudit`.
16. **issue-triage** — over `maintenance_tickets`: transcript (simulated STT), category + severity (rules, or Claude via `packages/ai` when keyed), trade pick; emergencies auto-dispatch only if a 24/7 trade exists, else lead Today in brick.
17. **interaction-memory** — over `staff_notes`, `sessions`, `communications`: summary + `commitments` rows; "Before your next contact" panel on the tenant record shows overdue promises.
18. **owner-digest** → "morning summary" — one email, same list as Today, kept as a document.
19. **regulation-watch** — live legislation.gov.uk, classified supported|residential|commercial|all|unknown, mapped to homes by class; `unknown` for review.
20. **insurance-renewal** — detect within lead time → risk → quotes (simulated until a broker endpoint is keyed) → benchmark → stop at the decision card. `POST /api/insurance/decision` records accept|decline|defer and never binds.

### Phase 5 — Screens (5 commits)
21. Homes: list with asset tags, certificate and arrears summary per home; home page with rooms, tenancies, certificates, policies; Add home / Add room / Add tenancy in three fields each; Print QR.
22. Rent: ladders drawn as beads with the "why" line, "Is this rent?" queue, HB status column, "Up to date" list.
23. Paperwork: the matrix, one Add-certificate action per empty or red cell.
24. Repairs + Jobs: tenant's words → severity → action; trades; contractor `/jobs`. Public `/report/[propertyId]`.
25. New laws + What the system did: regulation list with impacts and review; audit list leading with ✋ rows, KYA receipt expansion, chain verify on click, agent health grid.

### Phase 6 — Seed and verify (3 commits)
26. `scripts/seed.ts` (refuses production unless `ALLOW_DEMO_SEED=1`): one supported-housing org with 3 HMOs, 12 tenants in rooms, two HB-pending arrears at 10 and 30 days, one missing Fire Risk Assessment, one emergency repair, two commitments (one overdue); one private-landlord org with residential + commercial to prove the ladders diverge.
27. `scripts/verify.ts` extended with the donor's §11 checks: agents ran, rungs correct per class, H9–H12 invariants (no receipt from a weak match, no cycle decided by an agent, nothing released without approval, chain intact), H1 coverage, RBAC parity, `@estate-ops`/`pg` grep gate. `pnpm verify` must be green.
28. Playwright golden path: sign in as manager → Today shows the letter → Read & send → What the system did shows the approval and the ✋ row → tenant scans QR and reports → Today shows the repair. Contractor sees only Jobs. Tenant sees only their portal.

### Phase 7 — Ship (2 commits)
29. Worker deployed on Railway against production Postgres (`START_CMD=pnpm start:worker`; Supabase pooler until consolidation Step 5, Railway Postgres after). `/api/health` green. Connections panel in Settings shows LIVE/PRACTICE per adapter with the variable name that switches each on.
30. `CLAUDE.md` updated: topology, H9–H14, roles including contractor, nav, the first principle. `docs/HARDENING.md` gains H9–H14 with status boxes ticked only when the test exists. `BUILD_REPORT.md` coverage matrix. Move `estate-ops 2/` to `../estate-ops-reference/`.

---

## 6. Rules of the build

- Read before you write. Every feature traces to a row in section 4 or 5.
- One change per commit. Typecheck, lint, tests green before every commit. Never commit red.
- Every DB write through `packages/db`. Every agent write with a receipt. Every agent run in a span.
- Zod first. Never hand-type what `z.infer` can give you. Every new table has a schema in `packages/validation` before its API route exists.
- Additive migrations only. Never edit an applied migration. Never drop a Tenant Hub table. Compatibility views over renamed shapes.
- No browser storage for state. No demo-mode data paths. No conditional data source on an env flag.
- Errors: typed, with a reference the user can quote. Never a stack trace on screen.
- Copy: read it aloud to an imaginary eight-year-old before you commit it.
- When the spec is ambiguous, pick the simpler screen, write the judgement in `DECISIONS.md`, and continue. Stop only for destructive actions.
- Report outcomes honestly. If a check fails, say so with the output. "Done" means verified by running.

## 7. Definition of done

- `pnpm install && pnpm verify` green; `pnpm e2e` green.
- Worker boots, ten agents register (nine ported + chain-stamp), heartbeat every 15 s, `/api/health` says `worker: ok`.
- A manager signs in and lands on Today, which lists only decisions. Everything on it has one button. Pressing it works, is audited, and shows on What the system did with a receipt.
- A support worker on a tablet can add a home, a room and a tenant, and run intake to signature, without reading a manual.
- A tenant can scan a QR and report a leak in two taps. Within an hour it is on Today with a severity and a trade.
- The supported ladder never drafts a letter to a vulnerable tenant before a check-in and a council query have happened, and never drafts a notice at all.
- Every simulated connection is badged. Nothing is bought, bound, paid or served by the system.
- The nav has 8 items. The removed 5 are each reachable in two taps.
