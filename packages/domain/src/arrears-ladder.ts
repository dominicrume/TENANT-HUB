/**
 * Asset class selects the rule set — IN CODE (H13). This is the one place the
 * arrears ladder, the required certificate set, and the drafted document exist.
 * No screen, no config table, no agent hard-codes any of this.
 *
 * Ported from the Estate Ops donor (docs/ESTATE_OPS_INTEGRATION_PROMPT.md §3.4)
 * with a third ladder the donor never needed: `supported`. A vulnerable tenant
 * in supported housing is behind on rent most often because a Housing Benefit
 * or Universal Credit claim is pending or suspended — not because they are
 * refusing to pay. The residential ladder (reminder → formal letter →
 * solicitor → notice) is the wrong tool. The supported ladder's first three
 * rungs are conversations and a council query, never a letter to the tenant,
 * and no supported rung ever drafts a notice.
 */
import type { UnitClass, AssetClass } from "@tenant-hub/validation";

export interface LadderRung {
  day: number;
  stage: string;
  action: string;
  requiresApproval: boolean;
  label: string;
}

export const ARREARS_LADDER: Record<UnitClass, LadderRung[]> = {
  supported: [
    { day: 7,  stage: "check_in",       action: "support_worker_check_in", requiresApproval: false, label: "Check in" },
    { day: 14, stage: "hb_chase",       action: "draft_council_hb_query",  requiresApproval: true,  label: "Chase housing benefit" },
    { day: 28, stage: "support_plan",   action: "draft_support_plan_note", requiresApproval: true,  label: "Support plan review" },
    { day: 56, stage: "formal_letter",  action: "generate_letter",         requiresApproval: true,  label: "Formal letter" },
    { day: 90, stage: "manager_review", action: "draft_manager_brief",     requiresApproval: true,  label: "Manager review" },
  ],
  residential: [
    { day: 5,  stage: "reminder",      action: "send_reminder",     requiresApproval: false, label: "Reminder" },
    { day: 14, stage: "formal_letter", action: "generate_letter",   requiresApproval: true,  label: "Formal letter" },
    { day: 30, stage: "solicitor",     action: "draft_instruction", requiresApproval: true,  label: "Solicitor" },
    { day: 60, stage: "notice",        action: "draft_notice",      requiresApproval: true,  label: "Notice to quit" },
  ],
  commercial: [
    { day: 5,  stage: "reminder",      action: "send_reminder",       requiresApproval: false, label: "Reminder" },
    { day: 14, stage: "formal_letter", action: "generate_letter",     requiresApproval: true,  label: "Formal letter" },
    { day: 21, stage: "solicitor",     action: "draft_instruction",   requiresApproval: true,  label: "Solicitor" },
    { day: 45, stage: "forfeiture",    action: "draft_forfeiture",    requiresApproval: true,  label: "Forfeiture" },
    { day: 60, stage: "bailiff",       action: "draft_bailiff_brief", requiresApproval: true,  label: "Bailiff" },
  ],
};

/** The furthest rung reached at `days` overdue, or null if under the first rung's day. */
export function rungForDays(cls: UnitClass, days: number): LadderRung | null {
  let found: LadderRung | null = null;
  for (const r of ARREARS_LADDER[cls]) if (days >= r.day) found = r;
  return found;
}

export function stageIndex(cls: UnitClass, stage: string): number {
  return ARREARS_LADDER[cls].findIndex((r) => r.stage === stage);
}

/* ── Required certificates ─────────────────────────────────────────────── */

export const REQUIRED_CERTIFICATES: Record<UnitClass, readonly string[]> = {
  supported: ["Gas Safety (CP12)", "EICR", "EPC", "Fire Risk Assessment", "Fire alarm & emergency lighting test", "Smoke & CO alarms", "Legionella risk assessment", "HMO licence", "PAT testing"],
  residential: ["Gas Safety (CP12) (residential)", "EICR (residential)", "EPC (residential)", "Smoke & CO alarms (residential)", "Legionella risk assessment (residential)"],
  commercial: ["EPC (commercial)", "EICR (commercial)", "Fire Risk Assessment (commercial)", "Asbestos Register", "Legionella risk assessment (commercial)", "Emergency lighting"],
};

/** Strip the "(commercial)"/"(residential)" suffix so "EICR (commercial)" matches a held certificate named "EICR". */
export const certBase = (name: string): string => name.replace(/\s*\((commercial|residential)\)\s*$/i, "").trim().toLowerCase();

/** The certificates a property needs, given its asset class and the classes of its units (a mixed property has more than one set). */
export function requiredCertificatesFor(assetClass: AssetClass, unitClasses: UnitClass[]): string[] {
  const set = new Set<string>();
  // `mixed` means "read the actual unit classes present" — it must NOT force every set on;
  // a mixed property with only supported and commercial units does not need the residential set.
  const sup = assetClass === "supported" || unitClasses.includes("supported");
  const res = assetClass === "residential" || unitClasses.includes("residential");
  const com = assetClass === "commercial" || unitClasses.includes("commercial");
  if (sup) for (const c of REQUIRED_CERTIFICATES.supported) set.add(c);
  if (res) for (const c of REQUIRED_CERTIFICATES.residential) set.add(c);
  if (com) for (const c of REQUIRED_CERTIFICATES.commercial) set.add(c);
  return [...set];
}

export type CertStatus = "valid" | "expiring" | "expired" | "missing";
export type AlertKind = "expiring_90" | "expiring_60" | "expiring_30" | "expiring_7" | "expired" | "missing";

export function certificateStatus(expiresOn: string | Date | null | undefined, today = new Date()): { status: CertStatus; days: number | null; alert: AlertKind | null } {
  if (!expiresOn) return { status: "missing", days: null, alert: "missing" };
  const midnight = new Date(today); midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((new Date(expiresOn).getTime() - midnight.getTime()) / 864e5);
  if (days < 0) return { status: "expired", days, alert: "expired" };
  if (days <= 7) return { status: "expiring", days, alert: "expiring_7" };
  if (days <= 30) return { status: "expiring", days, alert: "expiring_30" };
  if (days <= 60) return { status: "expiring", days, alert: "expiring_60" };
  if (days <= 90) return { status: "expiring", days, alert: "expiring_90" };
  return { status: "valid", days, alert: null };
}

/* ── Drafted documents (H14: informational only, never advice) ──────────── */

export const NOT_ADVICE = "Informational only — not legal advice. Confirm with your solicitor.";

export interface DraftInput {
  stage: string;
  cls: UnitClass;
  brand: string;
  tenantName: string;
  /** Property/home name. */
  propertyName: string;
  /** Room/unit reference. */
  unitRef: string;
  balance: number;
  daysOverdue: number;
  rentAmount: number;
  today?: Date;
}

export function draftArrearsDocument(i: DraftInput): { title: string; body: string } {
  const date = (i.today ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const money = `£${i.balance.toFixed(2)}`;
  const where = `${i.unitRef}, ${i.propertyName}`;
  const lease = i.cls === "commercial" ? "lease" : i.cls === "supported" ? "licence agreement" : "tenancy agreement";
  const head = `${i.brand}\n${date}\n\n`;
  const foot = `\n\n— Drafted by ${i.brand} for review. ${NOT_ADVICE}`;

  switch (i.stage) {
    /* ── supported ────────────────────────────────────────────────────── */
    case "check_in":
      return {
        title: `Check in — ${where}`,
        body: head +
          `Internal note for the support worker.\n\n${i.tenantName}'s service charge is ${i.daysOverdue} days behind (${money}). No letter goes to ${i.tenantName} at this stage — please check in with them directly and note anything relevant on their record.` +
          foot,
      };
    case "hb_chase":
      return {
        title: `Housing benefit query — ${where}`,
        body: head +
          `To: the local authority Housing Benefit team\n\nRe: ${i.tenantName}, ${where}\n\nWe would be grateful for an update on the status of this resident's Housing Benefit or Universal Credit housing element. ${money} of service charge has not been received while the claim appears to be in progress (${i.daysOverdue} days). Please let us know what stage the claim has reached and when payment is expected.` +
          foot,
      };
    case "support_plan":
      return {
        title: `Support plan review — ${where}`,
        body: head +
          `Internal note for the support worker and manager.\n\n${i.tenantName} has been ${i.daysOverdue} days behind on their service charge (${money}), and the housing benefit query at day 14 has not resolved it. Please review their support plan: is there a non-financial factor contributing, and is there support that could help before this needs a formal letter?` +
          foot,
      };
    case "formal_letter":
      if (i.cls === "supported") {
        return {
          title: `Formal letter — ${where}`,
          body: head +
            `Dear ${i.tenantName},\n\nWe wanted to write to you directly about your service charge account for ${where}. Our records show ${money} is outstanding and it has now been ${i.daysOverdue} days since it was due, under your ${lease}.\n\nWe know this can happen when a benefit claim is slow, and we would much rather talk it through with you than let it become a bigger problem. Please speak to your support worker, or contact us, so we can agree a way forward together.` +
            foot,
        };
      }
      return {
        title: `Formal rent arrears letter — ${where}`,
        body: head +
          `Dear ${i.tenantName},\n\nRe: ${where}\n\nOur records show rent of ${money} is outstanding and is now ${i.daysOverdue} days overdue under the ${lease}. A reminder was sent earlier.\n\nPlease pay the outstanding amount within 7 days, or contact us to agree a plan. We would much rather talk than escalate.\n\nIf payment is not received, we may have to take further steps under the ${lease}.\n\nYours sincerely,\n${i.brand}` +
          foot,
      };
    case "manager_review":
      return {
        title: `Manager review — ${where}`,
        body: head +
          `INTERNAL BRIEF (draft for the manager's review)\n\n${i.tenantName} at ${where} has reached day ${i.daysOverdue} of arrears (${money}) despite a check-in, a housing benefit query and a support plan review. Please decide the next step. This system does not draft or serve any notice for a supported licence.` +
          foot,
      };

    /* ── residential / commercial (shared reminder) ─────────────────────── */
    case "reminder":
      return {
        title: `Rent reminder — ${where}`,
        body: head +
          `Dear ${i.tenantName},\n\nA friendly reminder that ${money} of rent for ${where} is now ${i.daysOverdue} days overdue.\n\nIf you have already paid, thank you — please ignore this note. If something has changed, reply and we will work it out together.\n\nKind regards,\n${i.brand}` +
          foot,
      };
    case "solicitor":
      return {
        title: `Solicitor instruction brief — ${where}`,
        body: head +
          `INSTRUCTION BRIEF (draft for the owner's review before sending)\n\nMatter: rent arrears at ${where} (${i.cls} ${lease}).\nTenant: ${i.tenantName}\nArrears: ${money}, ${i.daysOverdue} days overdue. Rent: £${i.rentAmount.toFixed(2)} per period.\nSteps taken: reminder and formal letter issued; no resolution.\n\nPlease advise on the appropriate next step and prepare any correspondence.` +
          foot,
      };
    case "notice":
      return {
        title: `Notice preparation request — ${where}`,
        body: head +
          `REQUEST TO SOLICITOR (draft for the owner's review)\n\nPlease prepare the appropriate notice in respect of ${where}, tenant ${i.tenantName}, arrears ${money} (${i.daysOverdue} days). This system does not serve notices; any notice must be prepared and served by the appropriate professional.` +
          foot,
      };
    case "forfeiture":
      return {
        title: `Forfeiture review request — ${where}`,
        body: head +
          `REQUEST TO SOLICITOR (draft for the owner's review)\n\nCommercial lease at ${where}, tenant ${i.tenantName}. Arrears ${money}, ${i.daysOverdue} days overdue. Please review the lease's forfeiture provisions and advise on options and risks before any action is taken. Nothing is to be actioned without the owner's written instruction.` +
          foot,
      };
    case "bailiff":
      return {
        title: `Enforcement brief — ${where}`,
        body: head +
          `REQUEST TO SOLICITOR / ENFORCEMENT AGENT (draft for the owner's review)\n\nCommercial premises at ${where}, tenant ${i.tenantName}. Arrears ${money}, ${i.daysOverdue} days overdue. Please advise on lawful enforcement options (e.g. CRAR eligibility) and the required notices. The owner will instruct in writing before any step is taken.` +
          foot,
      };
    default:
      return { title: `Arrears note — ${where}`, body: head + `Arrears of ${money} at ${where}, ${i.daysOverdue} days overdue.` + foot };
  }
}
