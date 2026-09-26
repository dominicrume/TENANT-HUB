/**
 * insurance-renewal — detects a policy entering its renewal lead time,
 * assembles a risk profile from what the system already knows about that
 * property (asset class, open compliance alerts, open repairs, the prior
 * premium), gets quotes (simulated until a broker endpoint is keyed —
 * @tenant-hub/adapters' insuranceQuotes()), benchmarks them, and stops dead
 * at the decision card. It never sets a cycle to "decided" — only a person
 * can, through POST /api/insurance/decision — and every run that reaches
 * the card records a `bind_insurance` refusal on its receipt (H10, H11):
 * this agent is built so it structurally cannot bind cover, not just told
 * not to.
 *
 * A cycle is created once per policy and left alone once it reaches
 * awaiting_decision or decided — re-running never re-quotes a cycle
 * already at or past the card, so quotes are gathered exactly once per
 * renewal, not once per drain.
 */
import { writeWithAudit } from "@tenant-hub/db";
import { insuranceQuotes } from "@tenant-hub/adapters";
import type { RiskProfile } from "@tenant-hub/ports";
import type { AssetClass } from "@tenant-hub/validation";
import type { AgentContext } from "../registry";
import { mandate, read, refuse, receipt, withOutcome, today } from "./common";

export const INSURANCE_MANDATE = mandate("insurance-renewal", ["insurance_policies", "compliance_alerts", "maintenance_tickets", "quotes"], ["move_money", "send_legal_notice", "bind_insurance"]);
export const INSURANCE_LABEL = "Insurance renewal";

const AGENT_ACTOR = { user_id: "", user_name: "System · insurance-renewal", user_role: "system" } as const;

interface PolicyRow { id: string; property_id: string; annual_premium: string | number | null; renewal_date: string; renewal_lead_days: number }
interface CycleRow { id: string; status: string }
interface PropertyRow { asset_class: AssetClass; floors: number | null; rebuild_value: string | number | null }

function daysUntil(dateIso: string, day: string): number {
  return Math.round((new Date(dateIso).getTime() - new Date(day).getTime()) / 864e5);
}

export async function insuranceRenewal(ctx: AgentContext): Promise<void> {
  const r = receipt("insurance-renewal", "renew", "recorded");
  read(r, INSURANCE_MANDATE, "insurance_policies", "live");

  const day = today();
  const policies = (await ctx.client.query<PolicyRow>(
    "SELECT id, property_id, annual_premium, renewal_date::text AS renewal_date, renewal_lead_days FROM insurance_policies WHERE org_id = $1 AND renewal_date IS NOT NULL", [ctx.orgId])).rows;

  for (const policy of policies) {
    if (daysUntil(policy.renewal_date, day) > policy.renewal_lead_days) continue;

    let cycle = (await ctx.client.query<CycleRow>(
      "SELECT id, status FROM insurance_renewal_cycles WHERE org_id = $1 AND policy_id = $2 AND status NOT IN ('decided', 'lapsed') ORDER BY created_at DESC LIMIT 1",
      [ctx.orgId, policy.id])).rows[0];

    if (!cycle) {
      const created = await writeWithAudit({
        client: ctx.client, table: "insurance_renewal_cycles", action: "CREATE", org_id: ctx.orgId,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, policy_id: policy.id, status: "detected", prior_premium: policy.annual_premium },
      });
      cycle = { id: String((created.data as Record<string, unknown>).id), status: "detected" };
    }

    if (cycle.status === "awaiting_decision" || cycle.status === "decided") continue; // already at the card, or already decided by a person

    read(r, INSURANCE_MANDATE, "compliance_alerts", "live");
    read(r, INSURANCE_MANDATE, "maintenance_tickets", "live");

    const property = (await ctx.client.query<PropertyRow>("SELECT asset_class, floors, rebuild_value FROM properties WHERE id = $1", [policy.property_id])).rows[0]!;
    const missing = (await ctx.client.query<{ n: string | number }>(
      "SELECT count(*) n FROM compliance_alerts WHERE property_id = $1 AND resolved_at IS NULL", [policy.property_id])).rows[0]!.n;
    const open = (await ctx.client.query<{ n: string | number }>(
      "SELECT count(*) n FROM maintenance_tickets WHERE property_id = $1 AND status NOT IN ('Resolved', 'Closed')", [policy.property_id])).rows[0]!.n;

    const risk: RiskProfile = {
      rebuildValue: property.rebuild_value != null ? Number(property.rebuild_value) : 0, assetClass: property.asset_class, floors: property.floors,
      missingCertificates: Number(missing), openIssues: Number(open), priorPremium: policy.annual_premium != null ? Number(policy.annual_premium) : null,
    };

    const adapter = insuranceQuotes();
    read(r, INSURANCE_MANDATE, "quotes", adapter.mode === "live" ? "live" : "simulated");
    const result = await adapter.getQuotes(risk);

    let bestQuoteId: string | null = null;
    let bestPremium = Infinity;
    for (const q of result.data) {
      const saved = await writeWithAudit({
        client: ctx.client, table: "insurance_quotes", action: "CREATE", org_id: ctx.orgId,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: {
          org_id: ctx.orgId, policy_id: policy.id, cycle_id: cycle.id, provider_name: q.providerName,
          premium: q.premium, excess: q.excess, cover_summary: q.coverSummary, source_adapter: result.source, is_simulated: adapter.mode !== "live",
        },
      });
      if (q.premium < bestPremium) { bestPremium = q.premium; bestQuoteId = String((saved.data as Record<string, unknown>).id); }
    }

    refuse(r, INSURANCE_MANDATE, "bind_insurance", "quotes gathered and benchmarked — a person decides accept, decline or defer");

    await writeWithAudit({
      client: ctx.client, table: "insurance_renewal_cycles", action: "UPDATE", org_id: ctx.orgId,
      receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
      record: { id: cycle.id, status: "awaiting_decision", best_quote_id: bestQuoteId },
    });
  }
}
