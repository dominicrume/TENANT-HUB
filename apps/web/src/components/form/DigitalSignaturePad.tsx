/**
 * A real signature pad: draw with a finger (iPad), a stylus, a USB signing
 * board or the mouse — pointer events cover all of them. "Type instead" is
 * kept for anyone who can't draw. Until 2026-10-15 this component only ever
 * rendered a typed name in a cursive font; Matloob's "electronic signing
 * board" needs the real thing.
 *
 * Contract unchanged: onChange(pngDataUrl, yyyy-mm-dd) when signed, ("", "")
 * when cleared. `value` may carry an existing data-URL to show.
 */
"use client";

import { useEffect, useRef, useState } from "react";

interface DigitalSignaturePadProps {
  label?: string;
  value?: string;
  onChange: (base64: string, date: string) => void;
}

export function DigitalSignaturePad({ label = "Signature", value, onChange }: DigitalSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [signed, setSigned] = useState(Boolean(value && value.startsWith("data:image")));
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");

  // Crisp lines on retina screens: scale the backing store to the device pixel ratio.
  useEffect(() => {
    const c = canvasRef.current; if (!c || signed) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 420, h = 150;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0F1C2E";
    // The line people sign on.
    ctx.save(); ctx.strokeStyle = "#CBD2DB"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(16, h - 34); ctx.lineTo(w - 16, h - 34); ctx.stroke(); ctx.restore();
  }, [signed, mode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function down(e: React.PointerEvent<HTMLCanvasElement>) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d"); if (!ctx) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; if (!hasInk) setHasInk(true);
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) { drawing.current = false; last.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* fine */ } }

  function finish() {
    const c = canvasRef.current; if (!c) return;
    let dataUrl: string;
    if (mode === "type") {
      if (!typedName.trim()) return;
      const t = document.createElement("canvas"); t.width = 840; t.height = 300;
      const ctx = t.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, t.width, t.height);
      ctx.fillStyle = "#0F1C2E"; ctx.font = "italic 84px 'Brush Script MT', 'Segoe Script', cursive, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(typedName.trim(), t.width / 2, t.height / 2);
      dataUrl = t.toDataURL("image/png");
    } else {
      if (!hasInk) return;
      dataUrl = c.toDataURL("image/png");
    }
    setSigned(true);
    onChange(dataUrl, new Date().toISOString().slice(0, 10));
  }
  function clear() {
    setSigned(false); setHasInk(false); setTypedName(""); onChange("", "");
    const c = canvasRef.current; const ctx = c?.getContext("2d"); if (c && ctx) { ctx.clearRect(0, 0, c.width, c.height); }
    // Re-run the setup effect by toggling mode back to itself on the next tick.
    setMode((m) => m);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="lbl" style={{ margin: 0 }}>{label}</span>
        {!signed && <button type="button" onClick={() => setMode((m) => (m === "draw" ? "type" : "draw"))} style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{mode === "draw" ? "Type my name instead" : "Draw instead"}</button>}
      </div>
      {signed && value ? (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, background: "#fff", padding: 6, display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Signature" style={{ height: 70, maxWidth: "100%" }} />
          <span style={{ fontSize: 12, color: "#1E7F4F", fontWeight: 600 }}>Signed ✓</span>
          <button type="button" className="btn ghost sm" onClick={clear} style={{ marginLeft: "auto" }}>Sign again</button>
        </div>
      ) : mode === "type" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Full name, as a signature" style={{ flex: 1, minWidth: 200, minHeight: 42, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", fontFamily: "inherit", fontSize: 14 }} />
          <button type="button" className="rel sm" disabled={!typedName.trim()} onClick={finish}>Sign</button>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
            style={{ width: "100%", height: 150, border: "1px solid var(--line)", borderRadius: 10, background: "#fff", touchAction: "none", cursor: "crosshair", display: "block" }} aria-label={`${label} — sign here`} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="rel sm" disabled={!hasInk} onClick={finish}>Done — that&apos;s my signature</button>
            <button type="button" className="btn ghost sm" onClick={clear} disabled={!hasInk}>Clear</button>
            <span className="muted" style={{ fontSize: 12 }}>Finger, stylus or mouse.</span>
          </div>
        </>
      )}
    </div>
  );
}
