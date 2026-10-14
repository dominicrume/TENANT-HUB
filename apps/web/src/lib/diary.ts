export type DiarySource = "diary" | "viewing" | "session" | "commitment" | "repair" | "certificate" | "move_in" | "rent_due";
export type DiaryStatus = "confirmed" | "unconfirmed" | "cancelled";

export interface DiaryItem {
  id: string; source: DiarySource;
  kind: string; title: string; at: string; endAt: string | null; allDay: boolean; done: boolean; status: DiaryStatus;
  href: string | null; who: string | null; where: string | null; notes: string | null;
  /** The member of staff this is for — "I need to know what my people are doing that day". */
  assignedTo: string | null;
  /** Money events carry the amount (rent due). */
  amount: number | null;
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
