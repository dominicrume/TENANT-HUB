import { NextResponse } from "next/server";
import { writeWithAudit, getPropertyForReport, countRecentQrReports } from "@tenant-hub/db";
import { PublicReportSchema } from "@tenant-hub/validation";

/**
 * POST /api/report/[propertyId] — the wall QR poster's own route (BUILD_PLAN
 * C33, Homes' "Print QR" button). Deliberately unauthenticated: whoever
 * scans the poster has no account and needs none. Rate-limited PER PROPERTY
 * (not per IP — several tenants sharing a house, and a flatmate on the same
 * wifi, must never be mistaken for a spammer) rather than the generic
 * IP-based limiter every other route uses.
 *
 * issue-triage (apps/worker) picks this ticket up on its own schedule —
 * this route only ever records the report, in the tenant's own words,
 * severity untouched, exactly like a staff-logged ticket before triage runs.
 */
const AGENT_ACTOR = { user_id: "", user_name: "Public QR report", user_role: "system" } as const;
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

export async function POST(req: Request, { params }: { params: { propertyId: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = PublicReportSchema.safeParse({ ...body, property_id: params.propertyId });
  if (!parsed.success) return NextResponse.json({ error: "Tell us a bit more about what's wrong." }, { status: 422 });

  const property = await getPropertyForReport(params.propertyId);
  if (!property) return NextResponse.json({ error: "This QR code isn't linked to a home." }, { status: 404 });

  const recent = await countRecentQrReports(params.propertyId, RATE_LIMIT.windowMs);
  if (recent >= RATE_LIMIT.max) {
    return NextResponse.json({ error: "A few reports have already come in from this home in the last hour — a person will be in touch." }, { status: 429 });
  }

  try {
    await writeWithAudit({
      table: "maintenance_tickets",
      action: "CREATE",
      org_id: property.orgId,
      ...AGENT_ACTOR,
      record: {
        org_id: property.orgId, property_id: property.id, unit_id: parsed.data.unit_id ?? null,
        room_number: "Not given", issue_type: "Pending triage",
        description: parsed.data.raw_report, raw_report: parsed.data.raw_report,
        reported_via: "qr", reported_by: parsed.data.reporter?.trim() || "Anonymous (QR)",
        status: "Open",
      } as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not send the report" }, { status: 500 });
  }
}
