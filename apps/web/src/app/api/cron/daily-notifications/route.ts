import { NextResponse } from "next/server";
import { adminClient } from "@tenant-hub/db";
import {
  sendRentDueReminder,
  sendSessionReminder,
  sendHBAlert,
} from "../../../../lib/resend";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // 1. Verify CRON Security Token
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    const authHeader = req.headers.get("authorization");
    const cronKeyHeader = req.headers.get("x-cron-key");

    if (authHeader !== `Bearer ${cronSecret}` && cronKeyHeader !== cronSecret) {
      // Allow local development check if query param is set
      const url = new URL(req.url);
      if (url.searchParams.get("key") !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const report: Record<string, any> = {
      remindersSent: 0,
      sessionsSent: 0,
      hbAlertsSent: 0,
      errors: [] as string[],
    };

    // ── A. SERVICE CHARGE REMINDERS (DUE IN 3 DAYS) ──
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const targetDateString = targetDate.toISOString().split("T")[0];

    const { data: charges, error: chargesErr } = await adminClient
      .from("service_charges")
      .select("amount, due_date, week_label, tenants(full_name, email)")
      .eq("is_paid", false)
      .eq("due_date", targetDateString);

    if (chargesErr) {
      report.errors.push(`Charges query error: ${chargesErr.message}`);
    } else if (charges) {
      for (const c of charges) {
        const tenant = c.tenants as any;
        if (tenant && tenant.email) {
          try {
            await sendRentDueReminder(
              tenant.email,
              tenant.full_name,
              Number(c.amount),
              c.due_date
            );
            report.remindersSent++;
          } catch (err: any) {
            report.errors.push(`Failed to send rent reminder to ${tenant.email}: ${err.message}`);
          }
        }
      }
    }

    // ── B. SUPPORT SESSION REMINDERS (SCHEDULED FOR TOMORROW) ──
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().split("T")[0];

    const { data: sessions, error: sessionsErr } = await adminClient
      .from("sessions")
      .select("session_date, tenants(full_name, email)")
      .eq("session_date", tomorrowString);

    if (sessionsErr) {
      report.errors.push(`Sessions query error: ${sessionsErr.message}`);
    } else if (sessions) {
      for (const s of sessions) {
        const tenant = s.tenants as any;
        if (tenant && tenant.email) {
          try {
            await sendSessionReminder(tenant.email, tenant.full_name, s.session_date);
            report.sessionsSent++;
          } catch (err: any) {
            report.errors.push(`Failed to send session reminder to ${tenant.email}: ${err.message}`);
          }
        }
      }
    }

    // ── C. HOUSING BENEFIT RISK ALERTS (TO MANAGERS) ──
    const { data: managers, error: managersErr } = await adminClient
      .from("profiles")
      .select("email, full_name, org_id")
      .eq("role", "manager");

    if (managersErr) {
      report.errors.push(`Managers query error: ${managersErr.message}`);
    } else if (managers) {
      for (const m of managers) {
        if (!m.org_id || !m.email) continue;

        const { data: riskyTenants, error: riskyErr } = await adminClient
          .from("tenants")
          .select("full_name, housing_benefit_status")
          .eq("org_id", m.org_id)
          .eq("is_archived", false)
          .in("housing_benefit_status", ["suspended"]);

        if (riskyErr) {
          report.errors.push(`Risky tenants query error for org ${m.org_id}: ${riskyErr.message}`);
        } else if (riskyTenants && riskyTenants.length > 0) {
          try {
            await sendHBAlert(
              m.email,
              m.full_name,
              riskyTenants.map(t => ({
                name: t.full_name,
                status: t.housing_benefit_status,
              }))
            );
            report.hbAlertsSent++;
          } catch (err: any) {
            report.errors.push(`Failed to send HB alert to manager ${m.email}: ${err.message}`);
          }
        }
      }
    }

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    console.error("Daily notifications CRON failure:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
