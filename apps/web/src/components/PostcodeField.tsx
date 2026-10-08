"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live UK postcode suggestions as you type — api.postcodes.io, free and
 * keyless (Ordnance Survey/Royal Mail-backed open data, no account, no
 * billing). This gets the "type B4 and see real suggestions" behaviour
 * Rume asked for directly from Google Maps — it does NOT return full
 * street-level addresses (no "5 Formans Road, 7 Formans Road…" picker;
 * that needs a paid UK address API like Ideal Postcodes or Google Places,
 * a real vendor decision, not something to pick silently). This is the
 * part of that ask with zero cost and zero setup, shipped now rather than
 * waiting on that decision.
 */
export function PostcodeField({
  value, onChange, placeholder = "e.g. B11 3AA", style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q)}/autocomplete`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { result: string[] | null } | null) => setSuggestions(j?.result ?? []))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={style}
      />
      {open && suggestions.length > 0 && (
        <ul style={{
          position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)",
          listStyle: "none", margin: 0, padding: 4, maxHeight: 220, overflowY: "auto",
        }}>
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => { onChange(s); setSuggestions([]); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5, fontFamily: "inherit" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cream)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
