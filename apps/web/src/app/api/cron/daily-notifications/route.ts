import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  getServiceChargesDueOn,
  getSessionsOn,
  getHousingBenefitAlerts,
} from "@tenant-hub/db";
import {
  sendRentDueReminder,
  sendSessionReminder,
  sendHBAlert,
} from "../../../../lib/resend";

export const dynamic = "force-dynamic";

/** Constant-time comparison so a wrong secret leaks nothing via response timing. */
function secretMatches(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isoDateOffsetByDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // slice rather than split(...)[0] — ISO 8601 dates are always 10 chars, and
  // this keeps the return type `string` under noUncheckedIndexedAccess.
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
    }

    // Headers only. The secret must never travel in a query string — URLs are
    // written to Vercel access logs, proxy logs and Referer headers.
    const authHeader = req.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const authorised =
      secretMatches(bearer, cronSecret) || secretMatches(req.headers.get("x-cron-key"), cronSecret);

    if (!authorised) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const report = {
      remindersSent: 0,
      sessionsSent: 0,
      hbAlertsSent: 0,
      errors: [] as string[],
    };

    // ── A. SERVICE CHARGE REMINDERS (DUE IN 3 DAYS) ──
    try {
      for (const charge of await getServiceChargesDueOn(isoDateOffsetByDays(3))) {
        try {
          await sendRentDueReminder(
            charge.tenantEmail,
            charge.tenantName,
            charge.amount,
            charge.dueDate
          );
          report.remindersSent++;
        } catch (err: any) {
          report.errors.push(`Failed to send rent reminder to ${charge.tenantEmail}: ${err.message}`);
        }
      }
    } catch (err: any) {
      report.errors.push(err.message);
    }

    // ── B. SUPPORT SESSION REMINDERS (SCHEDULED FOR TOMORROW) ──
    try {
      for (const session of await getSessionsOn(isoDateOffsetByDays(1))) {
        try {
          await sendSessionReminder(session.tenantEmail, session.tenantName, session.sessionDate);
          report.sessionsSent++;
        } catch (err: any) {
          report.errors.push(
            `Failed to send session reminder to ${session.tenantEmail}: ${err.message}`
          );
        }
      }
    } catch (err: any) {
      report.errors.push(err.message);
    }

    // ── C. HOUSING BENEFIT RISK ALERTS (TO MANAGERS) ──
    try {
      for (const alert of await getHousingBenefitAlerts()) {
        try {
          await sendHBAlert(alert.managerEmail, alert.managerName, alert.tenants);
          report.hbAlertsSent++;
        } catch (err: any) {
          report.errors.push(`Failed to send HB alert to manager ${alert.managerEmail}: ${err.message}`);
        }
      }
    } catch (err: any) {
      report.errors.push(err.message);
    }

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    console.error("Daily notifications CRON failure:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
