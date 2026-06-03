import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

/**
 * GET /api/reports?tenantId=[id]&month=YYYY-MM
 * Returns the tenant plus their sessions and service charges for that month,
 * for the monthly council support report. Read-only (RLS).
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const month = url.searchParams.get("month"); // YYYY-MM
  if (!tenantId || !month) {
    return NextResponse.json({ error: "tenantId and month required" }, { status: 400 });
  }

  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;

  const [{ data: tenant }, { data: sessions }, { data: charges }] = await Promise.all([
    auth.supabase.from("tenants").select("*").eq("id", tenantId).single(),
    auth.supabase
      .from("sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("session_date", start)
      .lt("session_date", next)
      .order("session_date", { ascending: true }),
    auth.supabase
      .from("service_charges")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("due_date", start)
      .lt("due_date", next)
      .order("due_date", { ascending: true }),
  ]);

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  return NextResponse.json({ tenant, sessions: sessions ?? [], charges: charges ?? [] });
}
