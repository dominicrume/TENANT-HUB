/**
 * compliance-watch — recomputes every required certificate's status for every
 * home in the organisation, and raises or clears the matching alert:
 * expiring_90 → expiring_60 → expiring_30 → expiring_7 → expired → missing
 * (supabase/migrations/035_compliance_insurance.sql). Which certificates are
 * required comes from @tenant-hub/domain (H13: asset class selects the rule
 * set in code, never in a config table, never hard-coded on a screen).
 *
 * Idempotent per run: an alert already open at the right kind is left alone;
 * a kind change updates the same row in place (its unique index is per
 * org+property+certificate+kind, so changing kind in place never collides);
 * a certificate that becomes valid resolves any alert still open for it.
 *
 * This agent only ever reads certificates and writes compliance_alerts. It
 * never touches money, never sends a legal notice, never binds insurance.
 */
import { writeWithAudit } from "@tenant-hub/db";
import { requiredCertificatesFor, certificateStatus, certBase } from "@tenant-hub/domain";
import type { AssetClass, UnitClass } from "@tenant-hub/validation";
import type { AgentContext } from "../registry";
import { mandate, read, receipt } from "./common";

export const COMPLIANCE_MANDATE = mandate("compliance-watch", ["certificates", "certificate_rules"], ["move_money", "send_legal_notice", "bind_insurance"]);
export const COMPLIANCE_LABEL = "Certificate watch";

interface PropertyRow { id: string; asset_class: AssetClass; classes: UnitClass[] }
interface CertRow { property_id: string; expires_on: string | null; name: string }
interface AlertRow { id: string; property_id: string; certificate_name: string; kind: string }

/** No human actor: writeWithAudit's convention for an agent write (see packages/db/src/write-with-audit.ts). */
const AGENT_ACTOR = { user_id: "", user_name: `System · compliance-watch`, user_role: "system" } as const;

export async function complianceWatch(ctx: AgentContext): Promise<void> {
  const r = receipt("compliance-watch", "recompute", "recorded");
  read(r, COMPLIANCE_MANDATE, "certificates", "live");
  read(r, COMPLIANCE_MANDATE, "certificate_rules", "live", "@tenant-hub/domain");

  const props = (await ctx.client.query<PropertyRow>(
    `SELECT p.id, p.asset_class,
            COALESCE(array_remove(array_agg(DISTINCT u.unit_class::text), NULL), ARRAY[]::text[]) AS classes
     FROM properties p LEFT JOIN units u ON u.property_id = p.id
     WHERE p.org_id = $1
     GROUP BY p.id, p.asset_class`, [ctx.orgId])).rows;

  if (props.length === 0) return;

  const certs = (await ctx.client.query<CertRow>(
    `SELECT c.property_id, c.expires_on::text AS expires_on, ct.name
     FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id
     WHERE c.org_id = $1`, [ctx.orgId])).rows;

  const openAlerts = (await ctx.client.query<AlertRow>(
    `SELECT id, property_id, certificate_name, kind FROM compliance_alerts WHERE org_id = $1 AND resolved_at IS NULL`, [ctx.orgId])).rows;

  for (const property of props) {
    const required = requiredCertificatesFor(property.asset_class, property.classes as UnitClass[]);
    for (const name of required) {
      const held = certs
        .filter((c) => c.property_id === property.id && certBase(c.name) === certBase(name))
        .sort((a, b) => new Date(b.expires_on ?? 0).getTime() - new Date(a.expires_on ?? 0).getTime())[0];
      const status = certificateStatus(held?.expires_on ?? null);
      const open = openAlerts.find((a) => a.property_id === property.id && certBase(a.certificate_name) === certBase(name));

      if (status.alert === null) {
        // Valid. Resolve any alert still marked open for this certificate.
        if (open) {
          await writeWithAudit({
            client: ctx.client, table: "compliance_alerts", action: "UPDATE", org_id: ctx.orgId,
            receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
            record: { id: open.id, resolved_at: new Date().toISOString() },
          });
        }
        continue;
      }

      if (!open) {
        await writeWithAudit({
          client: ctx.client, table: "compliance_alerts", action: "CREATE", org_id: ctx.orgId,
          receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
          record: { org_id: ctx.orgId, property_id: property.id, certificate_name: name, kind: status.alert, expires_on: held?.expires_on ?? null },
        });
      } else if (open.kind !== status.alert) {
        await writeWithAudit({
          client: ctx.client, table: "compliance_alerts", action: "UPDATE", org_id: ctx.orgId,
          receipt: r, correlationId: ctx.correlationId, ...AGENT_ACTOR,
          record: { id: open.id, kind: status.alert, expires_on: held?.expires_on ?? null },
        });
      }
      // else: the right alert is already open — nothing to do this run.
    }
  }
}
