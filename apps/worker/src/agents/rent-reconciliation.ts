/**
 * rent-reconciliation — raises the next due charge for every active tenancy
 * from its rent_amount and rent_frequency, then asks the bank feed what came
 * in and matches it back. A confident match (reference and amount both line
 * up) is recorded as a payment; anything weaker goes to rent_unmatched for a
 * person to confirm on Today's "Is this rent?" — this agent never marks a
 * weak match as paid (H9; mayNeverDo below).
 *
 * Idempotent: charge generation checks the tenancy's last due date before
 * inserting (migration 039's unique index is the backstop); a bank
 * transaction already recorded as a payment or already queued as unmatched
 * (its externalId) is skipped on every later run.
 */
import { writeWithAudit, type Queryable } from "@tenant-hub/db";
import { bankFeed } from "@tenant-hub/adapters";
import type { ExpectedRent, BankTransaction } from "@tenant-hub/ports";
import type { RentFrequency } from "@tenant-hub/validation";
import type { AgentContext } from "../registry";
import { mandate, read, refuse, receipt, withOutcome, today } from "./common";

export const RENT_MANDATE = mandate("rent-reconciliation", ["rent_schedule", "sim:bank", "live:bank"], ["mark_paid_on_weak_match", "move_money"]);
export const RENT_LABEL = "Rent reconciliation";
const CONFIDENCE_THRESHOLD = 0.95;
const MAX_CATCHUP_CHARGES = 500; // ~9.6 years of weekly charges — a generous backstop against bad data, not a real ceiling

const AGENT_ACTOR = { user_id: "", user_name: "System · rent-reconciliation", user_role: "system" } as const;

/* ── Pure helpers (exported for direct unit testing) ─────────────────────── */

const PERIOD_DAYS: Partial<Record<RentFrequency, number>> = { weekly: 7, fortnightly: 14, four_weekly: 28 };
export const PERIOD_LABEL: Record<RentFrequency, string> = {
  weekly: "Weekly charge", fortnightly: "Fortnightly charge", four_weekly: "4-weekly charge", monthly: "Monthly charge", quarterly: "Quarterly charge",
};

/** The next charge date after `from`, stepping by the tenancy's rent frequency. */
export function addPeriod(from: Date, freq: RentFrequency): Date {
  const d = new Date(from.getTime());
  const days = PERIOD_DAYS[freq];
  if (days) { d.setUTCDate(d.getUTCDate() + days); return d; }
  if (freq === "monthly") { d.setUTCMonth(d.getUTCMonth() + 1); return d; }
  d.setUTCMonth(d.getUTCMonth() + 3); // quarterly
  return d;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const surname = (fullName: string) => fullName.trim().split(/\s+/).pop() ?? fullName;

/** 1 = the expected reference appears in full; 0.4 = only its first word does (a truncated/partial bank reference); 0 = no sign of it. */
export function referenceScore(txReference: string, expectedReference: string): number {
  const tx = txReference.toUpperCase();
  const exp = expectedReference.toUpperCase().trim();
  if (!exp) return 0;
  if (tx.includes(exp)) return 1;
  const firstWord = exp.split(/\s+/)[0];
  if (firstWord && new RegExp(`\\b${escapeRegExp(firstWord)}\\b`).test(tx)) return 0.4;
  return 0;
}

/** 1 = within 1% of the expected amount; 0.5 = within 10%; 0.1 = further off (e.g. a part-payment). */
export function amountScore(txAmount: number, expectedAmount: number): number {
  if (!(expectedAmount > 0)) return 0;
  const ratio = txAmount / expectedAmount;
  if (ratio >= 0.99 && ratio <= 1.01) return 1;
  if (ratio >= 0.9 && ratio <= 1.1) return 0.5;
  return 0.1;
}

/** Reference and amount weighted equally. A clean match (full reference + exact amount) scores 1.0; a half-paid, part-referenced transaction scores well under the 0.95 threshold. */
export function matchConfidence(tx: { amount: number; reference: string }, expected: { amount: number; reference: string }): number {
  return Math.round((referenceScore(tx.reference, expected.reference) * 0.5 + amountScore(tx.amount, expected.amount) * 0.5) * 100) / 100;
}

export interface ExpectedCharge extends ExpectedRent { tenantId: string; tenantName: string }

/**
 * The best-scoring expected charge for a transaction, or null if none of them
 * share any textual signal with its reference. An amount coincidence alone
 * (say, two tenants both on £150 rent) is never enough to name a candidate —
 * only the reference can do that; amountScore only ever refines a candidate
 * the reference already picked out.
 */
export function bestMatch(tx: BankTransaction, expected: ExpectedCharge[]): { charge: ExpectedCharge; confidence: number } | null {
  let best: { charge: ExpectedCharge; confidence: number } | null = null;
  for (const charge of expected) {
    if (referenceScore(tx.reference, charge.reference) === 0) continue;
    const confidence = matchConfidence(tx, charge);
    if (!best || confidence > best.confidence) best = { charge, confidence };
  }
  return best;
}

/* ── The agent ─────────────────────────────────────────────────────────────── */

interface TenancyRow { tenancy_id: string; tenant_id: string; full_name: string; room_ref: string; rent_amount: string | number; rent_frequency: RentFrequency; start_date: string | null }

export async function rentReconciliation(ctx: AgentContext): Promise<void> {
  const r = receipt("rent-reconciliation", "reconcile", "recorded");
  read(r, RENT_MANDATE, "rent_schedule", "live");

  const tenancies = (await ctx.client.query<TenancyRow>(
    `SELECT t.id AS tenancy_id, t.tenant_id, tn.full_name, u.reference AS room_ref, t.rent_amount, t.rent_frequency, t.start_date::text AS start_date
     FROM tenancies t JOIN tenants tn ON tn.id = t.tenant_id JOIN units u ON u.id = t.unit_id
     WHERE t.org_id = $1 AND t.status = 'active'`, [ctx.orgId])).rows;

  if (tenancies.length === 0) return;

  const todayIso = today();

  /* 1. Generate every due charge up to today, one period at a time, from the tenancy's last charge (or its start date). */
  for (const t of tenancies) {
    const amount = Number(t.rent_amount);
    if (!(amount > 0)) continue;
    const lastDue = (await ctx.client.query<{ due_date: string }>(
      "SELECT due_date::text AS due_date FROM service_charges WHERE tenancy_id = $1 ORDER BY due_date DESC LIMIT 1", [t.tenancy_id])).rows[0]?.due_date;
    let candidate = lastDue ? addPeriod(new Date(lastDue), t.rent_frequency) : t.start_date ? new Date(t.start_date) : new Date(todayIso);
    let guard = 0;
    while (candidate.toISOString().slice(0, 10) <= todayIso && guard++ < MAX_CATCHUP_CHARGES) {
      const dueDate = candidate.toISOString().slice(0, 10);
      try {
        await writeWithAudit({
          client: ctx.client, table: "service_charges", action: "CREATE", org_id: ctx.orgId, tenant_id: t.tenant_id,
          receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
          record: { tenant_id: t.tenant_id, tenancy_id: t.tenancy_id, week_label: PERIOD_LABEL[t.rent_frequency], due_date: dueDate, amount, is_paid: false },
        });
      } catch {
        // Migration 039's unique index caught a race with another run — the charge already exists; move on.
      }
      candidate = addPeriod(candidate, t.rent_frequency);
    }
  }

  /* 2. Ask the bank feed about the last fortnight of charges, matched by a human-readable reference (surname + room). */
  const sinceIso = new Date(Date.now() - 14 * 864e5).toISOString();
  const expectedRows = (await ctx.client.query<TenancyRow & { due_date: string; amount: string | number }>(
    `SELECT t.id AS tenancy_id, t.tenant_id, tn.full_name, u.reference AS room_ref, t.rent_amount, t.rent_frequency, t.start_date::text AS start_date, c.due_date::text AS due_date, c.amount
     FROM service_charges c JOIN tenancies t ON t.id = c.tenancy_id JOIN tenants tn ON tn.id = t.tenant_id JOIN units u ON u.id = t.unit_id
     WHERE t.org_id = $1 AND c.due_date >= $2`, [ctx.orgId, sinceIso.slice(0, 10)])).rows;

  const expected: ExpectedCharge[] = expectedRows.map((e) => ({
    tenancyId: e.tenancy_id, tenantId: e.tenant_id, tenantName: e.full_name,
    reference: `${surname(e.full_name)} ${e.room_ref}`, amount: Number(e.amount), dueDate: e.due_date,
  }));

  const adapter = bankFeed();
  read(r, RENT_MANDATE, adapter.mode === "live" ? "live:bank" : "sim:bank", adapter.mode);
  const result = await adapter.transactions(expected, sinceIso);

  for (const tx of result.data) {
    if (await alreadyRecorded(ctx.client, ctx.orgId, tx.externalId)) continue;

    const match = bestMatch(tx, expected);
    if (!match) continue; // nothing in the ledger resembles this transaction at all

    if (match.confidence >= CONFIDENCE_THRESHOLD) {
      await writeWithAudit({
        client: ctx.client, table: "rent_payments", action: "CREATE", org_id: ctx.orgId, tenant_id: match.charge.tenantId,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: {
          tenant_id: match.charge.tenantId, tenancy_id: match.charge.tenancyId, amount: tx.amount,
          payment_type: result.mode === "simulated" ? "Bank transfer (simulated)" : "Bank transfer",
          payment_date: tx.postedOn, reference_note: tx.reference, external_reference: tx.externalId,
        },
      });
    } else {
      refuse(r, RENT_MANDATE, "mark_paid_on_weak_match",
        `£${tx.amount.toFixed(2)} on ${tx.postedOn} looks like ${match.charge.tenantName} but only scores ${Math.round(match.confidence * 100)}% — too weak to mark as paid without a person`);
      await writeWithAudit({
        client: ctx.client, table: "rent_unmatched", action: "CREATE", org_id: ctx.orgId, tenant_id: match.charge.tenantId,
        receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: {
          org_id: ctx.orgId, tenant_id: match.charge.tenantId, amount: tx.amount, received_on: tx.postedOn,
          external_reference: tx.externalId, confidence: match.confidence, source_adapter: result.source,
          is_simulated: result.mode === "simulated", status: "pending",
        },
      });
    }
  }
}

async function alreadyRecorded(client: Queryable, orgId: string, externalId: string): Promise<boolean> {
  const paid = await client.query("SELECT 1 FROM rent_payments WHERE external_reference = $1", [externalId]);
  if (paid.rows.length) return true;
  const queued = await client.query("SELECT 1 FROM rent_unmatched WHERE org_id = $1 AND external_reference = $2", [orgId, externalId]);
  return queued.rows.length > 0;
}
