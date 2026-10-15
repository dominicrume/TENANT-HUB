/**
 * Date + time without the browser's datetime-local widget (Rume, 2026-10-15:
 * "you have to click out… it's messy"). A date input — the native calendar
 * closes the moment a day is picked — and a time list in 15-minute steps.
 * Value in and out is a local "YYYY-MM-DDTHH:MM" string, same as before.
 */
"use client";

const TIMES: string[] = [];
for (let h = 6; h <= 22; h++) for (const m of [0, 15, 30, 45]) TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

export function DateTimeField({ value, onChange, label, required, allowEmptyTime, style }: {
  value: string; onChange: (v: string) => void; label?: string; required?: boolean;
  /** For an optional end: a blank time means "no end". */
  allowEmptyTime?: boolean; style?: React.CSSProperties;
}) {
  const [date = "", time = ""] = value ? value.split("T") : ["", ""];
  const times = time && !TIMES.includes(time) ? [time, ...TIMES] : TIMES;
  const set = (d: string, t: string) => onChange(d ? (t ? `${d}T${t}` : allowEmptyTime ? "" : `${d}T09:00`) : "");
  return (
    <div style={style}>
      {label && <span className="lbl">{label}</span>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 6 }}>
        <input type="date" value={date} required={required} onChange={(e) => set(e.target.value, time || (allowEmptyTime ? "" : "09:00"))} style={inp} aria-label={`${label ?? "Date"} — day`} />
        <select value={time} onChange={(e) => set(date || new Date().toISOString().slice(0, 10), e.target.value)} style={inp} aria-label={`${label ?? "Time"} — time`} required={required && !allowEmptyTime}>
          {allowEmptyTime && <option value="">—</option>}
          {times.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 42, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
