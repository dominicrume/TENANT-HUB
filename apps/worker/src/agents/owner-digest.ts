/**
 * owner-digest — the "morning summary": the exact list Today shows a person,
 * turned into one email and kept as a `documents` row (kind: "digest").
 * Built from @tenant-hub/domain's buildNeedsYou() — the SAME pure function
 * the web app's /api/needs-you route calls — over rows this agent fetches
 * itself via pg, so the digest can never show a different list to the one
 * on screen. A second, hand-rolled "Today, but for email" list is exactly
 * the kind of divergence H8 exists to rule out.
 *
 * The email is simulated (SimNotify) until Resend is keyed; the document's
 * `is_simulated` column carries that forward (H9), so a badge on Today can
 * say so without re-deriving it. Runs once a day — the scheduler's own
 * per-org dedupe key handles "once", not this agent (apps/worker/src/
 * scheduler.ts, same as every other daily agent).
 */
import { writeWithAudit } from "@tenant-hub/db";
import { buildNeedsYou, GROUP, GROUP_ORDER, type NeedsYouItem, type TenantRow, type ChargeRow, type TicketRow, type DraftRow, type HandoverRow } from "@tenant-hub/domain";
import type { AgentContext } from "../registry";
import { mandate, read, receipt, withOutcome, notify, managerEmail, orgName, today } from "./common";

export const DIGEST_MANDATE = mandate("owner-digest", ["tenants", "service_charges", "maintenance_tickets", "drafts", "shift_handovers"], ["move_money", "send_legal_notice", "bind_insurance"]);
export const DIGEST_LABEL = "Morning summary";

const AGENT_ACTOR = { user_id: "", user_name: "System · owner-digest", user_role: "system" } as const;

function renderDigest(items: NeedsYouItem[], org: string): string {
  const lines = [`Good morning — here's what needs you today at ${org}.`, ""];
  if (items.length === 0) {
    lines.push("Nothing needs you today. Everything is handled.");
    return lines.join("\n");
  }
  for (const kind of GROUP_ORDER) {
    const group = items.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    lines.push(GROUP[kind]);
    for (const i of group) { lines.push(`- ${i.title}`); lines.push(`  ${i.detail}`); }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export async function ownerDigest(ctx: AgentContext): Promise<void> {
  const r = receipt("owner-digest", "summarise", "recorded");
  for (const key of ["tenants", "service_charges", "maintenance_tickets", "drafts", "shift_handovers"]) read(r, DIGEST_MANDATE, key, "live");

  const day = today();
  const [tenants, charges, tickets, drafts, handovers] = await Promise.all([
    ctx.client.query<TenantRow>(
      "SELECT id, full_name, room_number, is_active, is_archived, housing_benefit_status, hb_claim_date::text AS hb_claim_date, moved_in::text AS moved_in FROM tenants WHERE org_id = $1", [ctx.orgId]),
    ctx.client.query<ChargeRow>(
      "SELECT sc.tenant_id, sc.amount, sc.is_paid, sc.due_date::text AS due_date FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id WHERE t.org_id = $1", [ctx.orgId]),
    ctx.client.query<TicketRow>(
      "SELECT id, room_number, issue_type, status, assigned_to, reported_by, created_at::text AS created_at FROM maintenance_tickets WHERE org_id = $1", [ctx.orgId]),
    ctx.client.query<DraftRow>(
      "SELECT d.id, d.step, d.expires_at::text AS expires_at, d.machine_state FROM drafts d JOIN profiles p ON p.id = d.created_by WHERE p.org_id = $1 AND d.step >= 3", [ctx.orgId]),
    ctx.client.query<HandoverRow>(
      "SELECT id, shift_date::text AS shift_date FROM shift_handovers WHERE org_id = $1 AND shift_date = $2", [ctx.orgId, day]),
  ]);

  const result = buildNeedsYou({ tenants: tenants.rows, charges: charges.rows, tickets: tickets.rows, drafts: drafts.rows, handoversToday: handovers.rows });
  const org = await orgName(ctx.client, ctx.orgId);
  const body = renderDigest(result.items, org);
  const notifier = notify();

  await writeWithAudit({
    client: ctx.client, table: "documents", action: "CREATE", org_id: ctx.orgId,
    receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
    record: { org_id: ctx.orgId, kind: "digest", title: `Morning summary — ${day}`, body, is_simulated: notifier.mode !== "live" },
  });

  const to = await managerEmail(ctx.client, ctx.orgId);
  if (to) await notifier.send({ to, channel: "email", subject: `Morning summary — ${org}`, body });
}
