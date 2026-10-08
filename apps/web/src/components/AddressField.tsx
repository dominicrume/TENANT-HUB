"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedAddress { line1: string; line2?: string; city: string; postcode: string }

interface Suggestion extends PickedAddress { kind: "address" | "postcode" }

/**
 * "Start typing an address…" — the Apex27/Google Maps behaviour Rume asked
 * for. Two sources merged into one dropdown:
 *   • addresses from /api/address/search (OpenStreetMap today; Google Places
 *     the moment GOOGLE_PLACES_API_KEY exists — no change here), and
 *   • postcode completions from api.postcodes.io (free, keyless), so typing
 *     "B4" or "B11 3A" lists real postcodes; picking one re-searches that
 *     postcode for the addresses at it.
 * Picking an address fills line1 (+line2) and postcode in the parent form.
 * OpenStreetMap's house-number coverage is patchy — when it has nothing for
 * a postcode, the picked postcode still fills in and the address is typed.
 */
export function AddressField({
  value, onChange, onPick, placeholder = "Start typing an address or postcode…", style,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (a: PickedAddress) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const latest = useRef(0);

  async function lookup(q: string) {
    const seq = ++latest.current;
    const looksLikePostcode = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$/i.test(q.trim());
    const [addr, pcs] = await Promise.all([
      q.trim().length >= 3
        ? fetch(`/api/address/search?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      looksLikePostcode
        ? fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q.trim())}/autocomplete`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (seq !== latest.current) return; // a newer keystroke already answered
    const addresses: Suggestion[] = ((addr as { results?: PickedAddress[]; mode?: string } | null)?.results ?? []).map((a) => ({ ...a, kind: "address" }));
    setSimulated((addr as { mode?: string } | null)?.mode === "simulated");
    const seen = new Set(addresses.map((a) => a.postcode));
    const postcodes: Suggestion[] = (((pcs as { result?: string[] } | null)?.result ?? []) as string[])
      .filter((p) => !seen.has(p))
      .map((p) => ({ line1: "", city: "", postcode: p, kind: "postcode" }));
    setItems([...addresses, ...postcodes].slice(0, 12));
  }

  useEffect(() => {
    if (value.trim().length < 2) { setItems([]); return; }
    const t = setTimeout(() => void lookup(value), 250);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(s: Suggestion) {
    if (s.kind === "postcode") {
      // A postcode on its own: fill it in and go looking for the houses at it.
      onPick({ line1: "", city: "", postcode: s.postcode });
      onChange(s.postcode);
      void lookup(s.postcode);
      setOpen(true);
      return;
    }
    onPick(s);
    onChange([s.line1, s.line2].filter(Boolean).join(", "));
    setItems([]);
    setOpen(false);
  }

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
      {open && items.length > 0 && (
        <ul style={{
          position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)",
          listStyle: "none", margin: 0, padding: 4, maxHeight: 260, overflowY: "auto",
        }}>
          {simulated && <li style={{ padding: "6px 10px", fontSize: 11, color: "var(--brick)", fontWeight: 700 }}>SIMULATED — not real addresses</li>}
          {items.map((s, i) => (
            <li key={`${s.kind}-${s.postcode}-${s.line1}-${i}`}>
              <button
                type="button"
                onClick={() => pick(s)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5, fontFamily: "inherit" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cream)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {s.kind === "postcode" ? (
                  <><b>{s.postcode}</b> <span style={{ color: "var(--slate-2)" }}>· postcode — pick to see addresses</span></>
                ) : (
                  <>{[s.line1, s.line2, s.city].filter(Boolean).join(", ")} <span style={{ color: "var(--slate-2)" }}>· {s.postcode}</span></>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
