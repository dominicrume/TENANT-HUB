/**
 * interaction-memory — every staff note, session and communication IS the
 * record of contact with a tenant; there is no parallel log. This agent
 * summarises each one once (@tenant-hub/ai's summariseInteraction) and lifts
 * any promise inside it into its own `commitments` row, so "Before your next
 * contact" is a query, not a re-read of every note (supabase/migrations/
 * 037_commitments.sql).
 *
 * A row is a candidate exactly once: the selection query only ever picks up
 * `summary IS NULL`, so re-running never re-summarises and never re-lifts a
 * promise already on the record — the same idempotence shape as
 * issue-triage's `severity IS NULL` guard. `sessions` carries no org_id of
 * its own; it is scoped through its tenant's organisation.
 *
 * Every run, independent of anything new, also turns a still-open commitment
 * overdue once its date has passed — a fact about the calendar, not a new
 * decision, so it carries no refusal.
 */
import { writeWithAudit } from "@tenant-hub/db";
import { summariseInteraction } from "@tenant-hub/ai";
import type { AgentContext } from "../registry";
import { mandate, read, receipt, withOutcome } from "./common";

export const MEMORY_MANDATE = mandate("interaction-memory", ["staff_notes", "sessions", "communications", "summariser"], ["move_money", "send_legal_notice", "bind_insurance"]);
export const MEMORY_LABEL = "Interaction memory";

const AGENT_ACTOR = { user_id: "", user_name: "System · interaction-memory", user_role: "system" } as const;

interface InteractionRow { id: string; tenant_id: string | null; text: string | null }
const SOURCES = ["staff_notes", "sessions", "communications"] as const;
type SourceTable = (typeof SOURCES)[number];

async function pending(ctx: AgentContext, table: SourceTable): Promise<InteractionRow[]> {
  if (table === "staff_notes") {
    return (await ctx.client.query<InteractionRow>(
      "SELECT id, tenant_id, note_content AS text FROM staff_notes WHERE org_id = $1 AND summary IS NULL ORDER BY created_at LIMIT 20", [ctx.orgId])).rows;
  }
  if (table === "communications") {
    return (await ctx.client.query<InteractionRow>(
      "SELECT id, tenant_id, content AS text FROM communications WHERE org_id = $1 AND summary IS NULL ORDER BY sent_at LIMIT 20", [ctx.orgId])).rows;
  }
  return (await ctx.client.query<InteractionRow>(
    `SELECT s.id, s.tenant_id, s.notes AS text FROM sessions s JOIN tenants t ON t.id = s.tenant_id
     WHERE t.org_id = $1 AND s.summary IS NULL ORDER BY s.created_at LIMIT 20`, [ctx.orgId])).rows;
}

export async function interactionMemory(ctx: AgentContext): Promise<void> {
  const r = receipt("interaction-memory", "summarise", "recorded");
  read(r, MEMORY_MANDATE, "staff_notes", "live");
  read(r, MEMORY_MANDATE, "sessions", "live");
  read(r, MEMORY_MANDATE, "communications", "live");

  for (const table of SOURCES) {
    for (const row of await pending(ctx, table)) {
      const memory = await summariseInteraction(row.text ?? "");
      read(r, MEMORY_MANDATE, "summariser", "live", memory.source);

      await writeWithAudit({
        client: ctx.client, table, action: "UPDATE", org_id: ctx.orgId, tenant_id: row.tenant_id ?? undefined,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { id: row.id, summary: memory.summary },
      });

      for (const c of memory.commitments) {
        await writeWithAudit({
          client: ctx.client, table: "commitments", action: "CREATE", org_id: ctx.orgId, tenant_id: row.tenant_id ?? undefined,
          receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
          record: { org_id: ctx.orgId, tenant_id: row.tenant_id ?? null, source_table: table, source_id: row.id, text: c.text, owner: c.owner, due_on: c.due_on },
        });
      }
    }
  }

  // A promise whose date has passed becomes overdue — checked every run, not just when new notes arrive.
  const overdue = (await ctx.client.query<{ id: string }>(
    "SELECT id FROM commitments WHERE org_id = $1 AND status = 'open' AND due_on IS NOT NULL AND due_on < CURRENT_DATE", [ctx.orgId])).rows;
  for (const c of overdue) {
    await writeWithAudit({
      client: ctx.client, table: "commitments", action: "UPDATE", org_id: ctx.orgId,
      receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
      record: { id: c.id, status: "overdue" },
    });
  }
}
