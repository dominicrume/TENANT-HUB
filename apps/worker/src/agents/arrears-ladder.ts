/**
 * arrears-ladder — advances each active tenancy's rung by days overdue,
 * choosing the ladder by the UNIT's class (supported | residential |
 * commercial — a mixed property has more than one ladder), drafts the
 * stage's document, and auto-releases only the very first rung. Every rung
 * after it waits for a recorded human approval (H11) — this agent never
 * sends a legal notice, moves money, or binds insurance (its mandate).
 *
 * A case opens when a tenancy first reaches a rung, advances when the rung
 * moves further down the ladder, and closes (without deleting its history)
 * the moment the balance clears or an older charge gets paid and the rung
 * moves back — oldest_unpaid is FIFO (034), so this can happen.
 */
import { writeWithAudit } from "@tenant-hub/db";
import { rungForDays, stageIndex, draftArrearsDocument, TENANT_FACING_STAGES } from "@tenant-hub/domain";
import type { UnitClass } from "@tenant-hub/validation";
import type { AgentContext } from "../registry";
import { mandate, read, refuse, receipt, withOutcome, notify, orgName, daysBetween, today } from "./common";

export const ARREARS_MANDATE = mandate("arrears-ladder", ["tenancy_arrears", "ladder_config"], ["send_legal_notice", "move_money", "bind_insurance"]);
export const ARREARS_LABEL = "Arrears ladder";

const AGENT_ACTOR = { user_id: "", user_name: "System · arrears-ladder", user_role: "system" } as const;

interface ArrearsRow {
  tenant_id: string; tenancy_id: string; balance: string | number; oldest_unpaid: string | null;
  full_name: string; email: string | null; rent_amount: string | number; unit_class: UnitClass; uref: string; pname: string;
}
interface CaseRow { id: string; stage: string }

export async function arrearsLadder(ctx: AgentContext): Promise<void> {
  const r = receipt("arrears-ladder", "advance_ladder", "recorded");
  read(r, ARREARS_MANDATE, "tenancy_arrears", "live");
  read(r, ARREARS_MANDATE, "ladder_config", "live", "@tenant-hub/domain");

  const rows = (await ctx.client.query<ArrearsRow>(
    `SELECT ta.tenant_id, ta.tenancy_id, ta.balance, ta.oldest_unpaid::text AS oldest_unpaid,
            tn.full_name, tn.email, t.rent_amount, u.unit_class, u.reference AS uref, p.name AS pname
     FROM tenancy_arrears ta
     JOIN tenants tn ON tn.id = ta.tenant_id
     JOIN tenancies t ON t.id = ta.tenancy_id
     JOIN units u ON u.id = t.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE ta.org_id = $1 AND t.status = 'active'`, [ctx.orgId])).rows;

  if (rows.length === 0) return;
  const brand = await orgName(ctx.client, ctx.orgId);

  for (const row of rows) {
    const balance = Number(row.balance);
    const cls = row.unit_class;
    const open = (await ctx.client.query<CaseRow>(
      "SELECT id, stage FROM arrears_cases WHERE org_id = $1 AND tenant_id = $2 AND closed_on IS NULL ORDER BY opened_on DESC LIMIT 1", [ctx.orgId, row.tenant_id])).rows[0];

    if (balance <= 0 || !row.oldest_unpaid) {
      if (open) await writeWithAudit({
        client: ctx.client, table: "arrears_cases", action: "UPDATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { id: open.id, closed_on: today() },
      });
      continue;
    }

    const days = daysBetween(row.oldest_unpaid);
    const rung = rungForDays(cls, days);
    if (!rung) continue; // under the first rung's day threshold — nothing to do yet

    let caseId: string;
    if (!open) {
      const created = await writeWithAudit({
        client: ctx.client, table: "arrears_cases", action: "CREATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, tenant_id: row.tenant_id, tenancy_id: row.tenancy_id, opened_on: today(), stage: rung.stage, balance_at_open: balance },
      });
      caseId = String((created.data as Record<string, unknown>).id);
    } else {
      caseId = open.id;
      if (stageIndex(cls, rung.stage) > stageIndex(cls, open.stage)) {
        await writeWithAudit({
          client: ctx.client, table: "arrears_cases", action: "UPDATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
          receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
          record: { id: caseId, stage: rung.stage },
        });
      } else if (stageIndex(cls, rung.stage) < stageIndex(cls, open.stage)) {
        // An older charge got paid (FIFO) and the rung moved back — close this case; a fresh one opens if it's overdue again.
        await writeWithAudit({
          client: ctx.client, table: "arrears_cases", action: "UPDATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
          receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
          record: { id: caseId, closed_on: today() },
        });
        continue;
      }
    }

    const already = await ctx.client.query("SELECT 1 FROM arrears_events WHERE case_id = $1 AND stage = $2", [caseId, rung.stage]);
    if (already.rows.length) continue; // this rung already has its document and event — nothing further this run

    const doc = draftArrearsDocument({
      stage: rung.stage, cls, brand, tenantName: row.full_name, propertyName: row.pname, unitRef: row.uref,
      balance, daysOverdue: days, rentAmount: Number(row.rent_amount),
    });
    const savedDoc = await writeWithAudit({
      client: ctx.client, table: "documents", action: "CREATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
      receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
      record: { org_id: ctx.orgId, kind: `arrears_${rung.stage}`, title: doc.title, body: doc.body, related_table: "arrears_cases", related_id: caseId, tenant_id: row.tenant_id, is_simulated: false },
    });
    const documentId = String((savedDoc.data as Record<string, unknown>).id);

    if (rung.requiresApproval) {
      refuse(r, ARREARS_MANDATE, "send_legal_notice", `${rung.label} for ${row.uref}, ${row.pname} is drafted and waits for a person to release it`);
      await writeWithAudit({
        client: ctx.client, table: "arrears_events", action: "CREATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
        receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, case_id: caseId, stage: rung.stage, action: rung.action, generated_document_id: documentId, requires_approval: true },
      });
    } else {
      if (TENANT_FACING_STAGES.has(rung.stage) && row.email) {
        await notify().send({ to: row.email, channel: "email", subject: doc.title, body: doc.body });
      }
      await writeWithAudit({
        client: ctx.client, table: "arrears_events", action: "CREATE", org_id: ctx.orgId, tenant_id: row.tenant_id,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, case_id: caseId, stage: rung.stage, action: rung.action, generated_document_id: documentId, requires_approval: false, released_at: new Date().toISOString() },
      });
    }
  }
}
