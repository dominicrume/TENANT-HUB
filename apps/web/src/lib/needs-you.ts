/**
 * Needs you today — the short list of things only a person can decide.
 *
 * This module is PURE: it turns already-fetched rows into items so the same
 * logic can be unit-tested and reused. Fetching lives in /api/needs-you; the UI
 * reads it through useNeedsYou() so the Today page and the nav badge can never
 * disagree (H8).
 *
 * C04 builds this from data Tenant Hub already has. Agent-driven groups
 * (letters to send, money in, insurance, paperwork) arrive with their agents
 * (docs/BUILD_PLAN.md M4) and slot into GROUP_ORDER.
 */

export type NeedsYouKind = "repairs" | "housing_benefit" | "money" | "signoffs" | "handover";

export interface NeedsYouItem {
  kind: NeedsYouKind;
  /** Plain words. "Housing benefit suspended — Amina K, Room 4" */
  title: string;
  /** One line of detail. Why it is here and what happens next. */
  detail: string;
  href: string;
  /** The one button. Verb first. */
  cta: string;
  /** due = money owed / risk (brick). warn = decision waiting (amber). info = a nudge. */
  tone: "due" | "warn" | "info";
}

export interface NeedsYouStats {
  peopleHoused: number;
  moneyOwed: number;
  housingBenefitAtRisk: number;
  repairsOpen: number;
}

export interface NeedsYouResponse {
  items: NeedsYouItem[];
  stats: NeedsYouStats;
  /** What was checked to build the list — shown under "Everything else is handled". */
  checked: string[];
  generatedAt: string;
}

export const GROUP: Record<NeedsYouKind, string> = {
  repairs: "Repairs",
  housing_benefit: "Housing benefit",
  money: "Money owed",
  signoffs: "Sign-offs",
  handover: "Handover",
};
export const GROUP_ORDER: NeedsYouKind[] = ["repairs", "housing_benefit", "money", "signoffs", "handover"];
export const GROUP_ICON: Record<NeedsYouKind, string> = { repairs: "⚒", housing_benefit: "£", money: "!", signoffs: "✎", handover: "☰" };

/* ── Row shapes: the minimum each source must provide ───────────────────── */
export interface TenantRow {
  id: string; full_name: string; room_number: string | null; is_active: boolean | null; is_archived: boolean | null;
  housing_benefit_status: "active" | "in_progress" | "suspended" | null; hb_claim_date: string | null; moved_in: string | null;
}
export interface ChargeRow { tenant_id: string; amount: number | string; is_paid: boolean | null; due_date: string; }
export interface TicketRow { id: string; room_number: string | null; issue_type: string; status: string; assigned_to: string | null; reported_by: string | null; created_at: string; }
export interface DraftRow { id: string; step: number; expires_at: string | null; machine_state: { extracted?: { full_name?: string } } | null; }
export interface HandoverRow { id: string; shift_date: string; }

export interface NeedsYouInput {
  tenants: TenantRow[];
  charges: ChargeRow[];
  tickets: TicketRow[];
  drafts: DraftRow[];
  handoversToday: HandoverRow[];
  now?: Date;
}

const DAY = 864e5;
const HB_PENDING_DAYS = 28;
const ARREARS_WEEKS = 2;

const daysAgo = (iso: string | null | undefined, now: Date) => (iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY) : null);
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const who = (t: TenantRow) => `${t.full_name}${t.room_number ? `, Room ${t.room_number}` : ""}`;

export function buildNeedsYou(input: NeedsYouInput): NeedsYouResponse {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const items: NeedsYouItem[] = [];
  const active = input.tenants.filter((t) => t.is_active !== false && !t.is_archived);
  const byId = new Map(active.map((t) => [t.id, t]));

  // Repairs: an open ticket nobody has picked up.
  const open = input.tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed" && t.status !== "resolved" && t.status !== "closed");
  for (const t of open.filter((x) => !x.assigned_to).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const d = daysAgo(t.created_at, now) ?? 0;
    items.push({
      kind: "repairs", tone: d >= 2 ? "due" : "warn",
      title: `${t.issue_type} repair waiting${t.room_number ? ` — Room ${t.room_number}` : ""}`,
      detail: `Reported ${d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`}${t.reported_by ? ` by ${t.reported_by}` : ""} · nobody is on it yet`,
      href: `/maintenance#ticket-${t.id}`, cta: "Assign someone",
    });
  }

  // Housing benefit: suspended is money at risk now; pending past 28 days needs a chase.
  for (const t of active) {
    if (t.housing_benefit_status === "suspended") {
      items.push({
        kind: "housing_benefit", tone: "due",
        title: `Housing benefit suspended — ${who(t)}`,
        detail: "Rent is not coming in. Call the council, then note what they said on the record.",
        href: `/tenants/${t.id}?tab=housing-benefit`, cta: "Chase the council",
      });
    } else if (t.housing_benefit_status === "in_progress") {
      const since = daysAgo(t.hb_claim_date ?? t.moved_in, now);
      if (since !== null && since >= HB_PENDING_DAYS) {
        items.push({
          kind: "housing_benefit", tone: "warn",
          title: `Housing benefit still pending — ${who(t)}`,
          detail: `${t.hb_claim_date ? "Claimed" : "Moved in"} ${since} days ago and nothing has been paid yet · a call usually moves it`,
          href: `/tenants/${t.id}?tab=housing-benefit`, cta: "Chase the council",
        });
      }
    }
  }

  // Money owed: two or more unpaid weeks past their due date.
  const overdue = new Map<string, { weeks: number; total: number }>();
  let moneyOwed = 0;
  for (const c of input.charges) {
    if (c.is_paid || c.due_date >= today) continue;
    const amt = Number(c.amount ?? 0);
    moneyOwed += amt;
    const cur = overdue.get(c.tenant_id) ?? { weeks: 0, total: 0 };
    overdue.set(c.tenant_id, { weeks: cur.weeks + 1, total: cur.total + amt });
  }
  for (const [tenantId, o] of overdue) {
    const t = byId.get(tenantId);
    if (!t || o.weeks < ARREARS_WEEKS) continue;
    items.push({
      kind: "money", tone: "due",
      title: `${o.weeks} weeks behind — ${who(t)}`,
      detail: `${money(o.total)} of service charge unpaid · ${t.housing_benefit_status === "active" ? "housing benefit is active, so this is a conversation" : "check the housing benefit first"}`,
      href: `/tenants/${t.id}?tab=ledger`, cta: "Open the ledger",
    });
  }

  // Sign-offs: an intake reviewed by staff, waiting for the tenant's signature.
  for (const d of input.drafts) {
    if (d.step < 3) continue;
    if (d.expires_at && d.expires_at < now.toISOString()) continue;
    const name = d.machine_state?.extracted?.full_name;
    items.push({
      kind: "signoffs", tone: "warn",
      title: `Signature needed — ${name ?? "new tenant"}`,
      detail: "Details are confirmed. Hand the tablet to the tenant to read and sign.",
      href: `/intake/${d.id}/verify`, cta: "Get the signature",
    });
  }

  // Handover: after midday, if nobody has written today's handover yet.
  if (now.getHours() >= 12 && input.handoversToday.length === 0) {
    items.push({
      kind: "handover", tone: "info",
      title: "Today's handover isn't written yet",
      detail: "Three lines is enough: who to watch, what's outstanding, what's changed.",
      href: "/handovers", cta: "Write it",
    });
  }

  const order = new Map(GROUP_ORDER.map((k, i) => [k, i]));
  items.sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || (a.tone === "due" ? -1 : 0) - (b.tone === "due" ? -1 : 0));

  return {
    items,
    stats: {
      peopleHoused: active.length,
      moneyOwed,
      housingBenefitAtRisk: active.filter((t) => t.housing_benefit_status === "suspended" || t.housing_benefit_status === "in_progress").length,
      repairsOpen: open.length,
    },
    checked: ["housing benefit", "service charges", "repairs", "signatures", "handovers"],
    generatedAt: now.toISOString(),
  };
}
