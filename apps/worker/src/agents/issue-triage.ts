/**
 * issue-triage — the tenant's own words → transcript (simulated speech-to-text
 * for a voice or phone report) → category + severity (Claude/OpenAI via
 * @tenant-hub/ai when a key is set, transparent rules otherwise and on any
 * failure) → a trade. An emergency auto-dispatches only when a 24/7-capable
 * trade is on file for that category; everything else proposes a
 * dispatch_jobs row and waits for a person to confirm — this agent may never
 * auto-dispatch a non-emergency (its mandate).
 *
 * A ticket is a candidate exactly once: the selection query only ever picks
 * up rows with severity IS NULL, so triage is naturally idempotent without a
 * separate dedupe key. Status stays the existing three-value vocabulary
 * (Open / In Progress / Resolved) — DECISIONS D19 defers the richer
 * new|triaged|dispatched|... vocabulary to the Repairs screen rebuild (C33);
 * this agent moves a ticket to "In Progress" only when it auto-dispatches.
 */
import { writeWithAudit } from "@tenant-hub/db";
import { stt } from "@tenant-hub/adapters";
import { triageIssue } from "@tenant-hub/ai";
import type { AgentContext } from "../registry";
import { mandate, read, refuse, receipt, withOutcome, notify } from "./common";

export const TRIAGE_MANDATE = mandate("issue-triage", ["issue_text", "sim:stt", "live:stt", "trades", "classifier"], ["auto_dispatch_non_emergency", "move_money", "send_legal_notice"]);
export const TRIAGE_LABEL = "Issue triage";

const AGENT_ACTOR = { user_id: "", user_name: "System · issue-triage", user_role: "system" } as const;

interface TicketRow { id: string; tenant_id: string | null; raw_report: string | null; transcript: string | null; reported_via: string; status: string }
interface TradeRow { id: string; name: string; contact_email: string | null; is_emergency_capable: boolean }

export async function issueTriage(ctx: AgentContext): Promise<void> {
  const r = receipt("issue-triage", "triage", "recorded");
  read(r, TRIAGE_MANDATE, "issue_text", "live");

  const issueId = ctx.payload["issueId"] as string | undefined;
  const tickets = (await ctx.client.query<TicketRow>(
    issueId
      ? "SELECT id, tenant_id, raw_report, transcript, reported_via, status FROM maintenance_tickets WHERE org_id = $1 AND id = $2 AND severity IS NULL"
      : "SELECT id, tenant_id, raw_report, transcript, reported_via, status FROM maintenance_tickets WHERE org_id = $1 AND severity IS NULL ORDER BY created_at LIMIT 20",
    issueId ? [ctx.orgId, issueId] : [ctx.orgId])).rows;

  for (const ticket of tickets) {
    let transcript = ticket.transcript ?? "";
    if (!transcript && (ticket.reported_via === "voice" || ticket.reported_via === "phone")) {
      const adapter = stt();
      const t = await adapter.transcribe({ audioRef: null, hint: ticket.raw_report });
      read(r, TRIAGE_MANDATE, adapter.mode === "live" ? "live:stt" : "sim:stt", adapter.mode);
      transcript = t.data.transcript;
    }
    const text = transcript || ticket.raw_report || "";
    const triage = await triageIssue(text);
    read(r, TRIAGE_MANDATE, "classifier", "live", triage.source);
    read(r, TRIAGE_MANDATE, "trades", "live");

    const byCategory = (await ctx.client.query<TradeRow>(
      "SELECT id, name, contact_email, is_emergency_capable FROM trades WHERE org_id = $1 AND category = $2 ORDER BY is_emergency_capable DESC LIMIT 1", [ctx.orgId, triage.data.category])).rows[0];
    const trade = byCategory ?? (await ctx.client.query<TradeRow>(
      "SELECT id, name, contact_email, is_emergency_capable FROM trades WHERE org_id = $1 AND category = 'general' LIMIT 1", [ctx.orgId])).rows[0];

    const emergency = triage.data.severity === "emergency";
    const canAutoDispatch = emergency && Boolean(trade?.is_emergency_capable);

    await writeWithAudit({
      client: ctx.client, table: "maintenance_tickets", action: "UPDATE", org_id: ctx.orgId, tenant_id: ticket.tenant_id ?? undefined,
      receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
      record: {
        id: ticket.id, transcript: transcript || ticket.transcript, category: triage.data.category, severity: triage.data.severity,
        triage_reasoning: `${triage.data.reasoning} · classified by ${triage.source}`, triaged_at: new Date().toISOString(),
        status: canAutoDispatch ? "In Progress" : ticket.status,
      },
    });

    if (canAutoDispatch) {
      await notify().send({ to: trade!.contact_email ?? trade!.name, channel: "email", subject: `EMERGENCY — ${triage.data.category}`, body: text });
      await writeWithAudit({
        client: ctx.client, table: "dispatch_jobs", action: "CREATE", org_id: ctx.orgId, tenant_id: ticket.tenant_id ?? undefined,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, ticket_id: ticket.id, trade_id: trade!.id, dispatched_at: new Date().toISOString() },
      });
    } else {
      refuse(r, TRIAGE_MANDATE, "auto_dispatch_non_emergency",
        emergency ? "no 24/7-capable trade on file for this category — proposed for a person" : `${triage.data.severity} — a person confirms the trade and the spend`);
      await writeWithAudit({
        client: ctx.client, table: "dispatch_jobs", action: "CREATE", org_id: ctx.orgId, tenant_id: ticket.tenant_id ?? undefined,
        receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, ticket_id: ticket.id, trade_id: trade?.id ?? null, dispatched_at: null },
      });
    }
  }
}
