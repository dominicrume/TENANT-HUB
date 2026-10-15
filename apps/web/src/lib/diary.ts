export type DiarySource = "diary" | "viewing" | "session" | "commitment" | "repair" | "certificate" | "move_in" | "rent_due";
export type DiaryStatus = "confirmed" | "unconfirmed" | "cancelled";

export interface DiaryItem {
  id: string; source: DiarySource;
  kind: string; title: string; at: string; endAt: string | null; allDay: boolean; done: boolean; status: DiaryStatus;
  /** The calendar day it belongs to, YYYY-MM-DD in Europe/London — never the UTC date of `at`. */
  day: string;
  href: string | null; who: string | null; where: string | null; notes: string | null;
  /** The member of staff this is for — "I need to know what my people are doing that day". */
  assignedTo: string | null;
  /** Money events carry the amount (rent due). */
  amount: number | null;
  /** 068: repeats (the Monday team meeting), who accompanies a viewing, and the feedback after it. */
  recurrence: Recurrence;
  accompaniedBy: "agent" | "landlord" | "both" | null;
  feedback: Feedback;
  /** True when this row is one occurrence of a repeating event (its id is `${seriesId}@${day}`). */
  occurrence: boolean;
}

export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "fortnightly" | "monthly";
export const RECURRENCES: Array<{ key: Recurrence; label: string }> = [
  { key: "none", label: "Does not repeat" }, { key: "daily", label: "Every day" }, { key: "weekdays", label: "Every weekday" },
  { key: "weekly", label: "Every week" }, { key: "fortnightly", label: "Every two weeks" }, { key: "monthly", label: "Every month" },
];
export type Feedback = "none" | "not_received" | "received" | "shared" | "skipped";
export const FEEDBACK: Array<{ key: Feedback; label: string; icon: string; colour: string }> = [
  { key: "none", label: "No feedback yet", icon: "", colour: "#8FA0B4" },
  { key: "not_received", label: "Feedback not received", icon: "🔕", colour: "#B24A31" },
  { key: "received", label: "Feedback received", icon: "💬", colour: "#1E7F4F" },
  { key: "shared", label: "Feedback shared", icon: "📤", colour: "#1E7F4F" },
  { key: "skipped", label: "Feedback skipped", icon: "⏭", colour: "#55637A" },
];
export const ACCOMPANIED: Array<{ key: "agent" | "landlord" | "both"; label: string; icon: string }> = [
  { key: "agent", label: "Accompanied by agent", icon: "🚗" }, { key: "landlord", label: "Accompanied by landlord", icon: "🏠" }, { key: "both", label: "Agent and landlord", icon: "🚗🏠" },
];
/** Expands a repeating event into the days it lands on within [from, to] (YYYY-MM-DD, inclusive). */
export function occurrences(startIso: string, recurrence: Recurrence, until: string | null, from: string, to: string): Date[] {
  const start = new Date(startIso); const out: Date[] = [];
  const end = new Date(`${to}T23:59:59`); const stop = until ? new Date(`${until}T23:59:59`) : end;
  const last = stop < end ? stop : end;
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const step = (d: Date) => {
    const n = new Date(d);
    if (recurrence === "daily" || recurrence === "weekdays") n.setDate(n.getDate() + 1);
    else if (recurrence === "weekly") n.setDate(n.getDate() + 7);
    else if (recurrence === "fortnightly") n.setDate(n.getDate() + 14);
    else if (recurrence === "monthly") n.setMonth(n.getMonth() + 1);
    return n;
  };
  let d = new Date(start); let guard = 0;
  while (d <= last && guard++ < 800) {
    const k = dayKey(d);
    if (k >= from && k <= to && !(recurrence === "weekdays" && (d.getDay() === 0 || d.getDay() === 6))) out.push(new Date(d));
    d = step(d);
  }
  return out;
}

/** Event types — the legend. Colour is the chip background; money and tasks read differently from appointments, as in Apex27. */
export const DIARY_KINDS = [
  { key: "viewing", label: "Viewing", icon: "👁", colour: "#4C7CE8" },
  { key: "inspection", label: "Inspection", icon: "🔍", colour: "#0FB5A6" },
  { key: "maintenance", label: "Repair / maintenance", icon: "🔧", colour: "#E8A84C" },
  { key: "meeting", label: "Meeting", icon: "🤝", colour: "#7C3AED" },
  { key: "call", label: "Call", icon: "📞", colour: "#1E7F4F" },
  { key: "move_in", label: "Move in", icon: "🔑", colour: "#1E7F4F" },
  { key: "move_out", label: "Move out", icon: "📦", colour: "#B24A31" },
  { key: "task", label: "Task", icon: "☑", colour: "#55637A" },
  { key: "valuation", label: "Valuation", icon: "🏷", colour: "#0F1C2E" },
  { key: "rent_due", label: "Rent due", icon: "£", colour: "#D63384" },
  { key: "session", label: "Support session", icon: "🗣", colour: "#0FB5A6" },
  { key: "promise", label: "Promise", icon: "🤝", colour: "#7C3AED" },
  { key: "other", label: "Other", icon: "📌", colour: "#8FA0B4" },
] as const;
export type DiaryKindKey = (typeof DIARY_KINDS)[number]["key"];

export const kindMeta = (k: string) => DIARY_KINDS.find((x) => x.key === k) ?? DIARY_KINDS[DIARY_KINDS.length - 1]!;

export const SOURCE_ICON: Record<DiarySource, string> = { diary: "📌", viewing: "👁", session: "🗣", commitment: "🤝", repair: "🔧", certificate: "📄", move_in: "🔑", rent_due: "£" };

export const STATUS_MARK: Record<DiaryStatus, { mark: string; label: string; colour: string }> = {
  confirmed: { mark: "✓", label: "Confirmed", colour: "#1E7F4F" },
  unconfirmed: { mark: "?", label: "Unconfirmed", colour: "#E8A84C" },
  cancelled: { mark: "✕", label: "Cancelled", colour: "#B24A31" },
};
