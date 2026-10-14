export interface DiaryItem {
  id: string; source: "diary" | "viewing" | "session" | "commitment" | "repair" | "certificate" | "move_in";
  kind: string; title: string; at: string; allDay: boolean; done: boolean; href: string | null; who: string | null; where: string | null; notes: string | null;
  /** The member of staff this is for — "I need to know what my people are doing that day". */
  assignedTo: string | null;
}

export const DIARY_KINDS = [
  { key: "viewing", label: "Viewing", icon: "👁" }, { key: "inspection", label: "Inspection", icon: "🔍" }, { key: "maintenance", label: "Maintenance", icon: "🔧" },
  { key: "meeting", label: "Meeting", icon: "🤝" }, { key: "call", label: "Call", icon: "📞" }, { key: "move_in", label: "Move in", icon: "🔑" }, { key: "move_out", label: "Move out", icon: "📦" }, { key: "other", label: "Other", icon: "📌" },
] as const;

export const SOURCE_ICON: Record<DiaryItem["source"], string> = { diary: "📌", viewing: "👁", session: "🗣", commitment: "🤝", repair: "🔧", certificate: "📄", move_in: "🔑" };
