"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A real camera, in the app (Rume, 2026-10-10: "take photo should switch
 * on the camera — iPhone, iPad, Android, every system"). `<input capture>`
 * only means "camera" on phones; on a laptop it quietly opens the file
 * picker, which is exactly the misleading button he saw. This uses
 * getUserMedia: live preview, Capture, Retake / Use photo, flip between
 * front and back cameras where there are two. If the camera is denied or
 * absent, it says so and offers the file picker instead — never pretends.
 * Rendered in a portal so no sticky/z-index parent can trap it.
 */
export function CameraCapture({ facing = "user", onCapture, onClose, title = "Take a photo" }: {
  facing?: "user" | "environment"; onCapture: (file: File) => void; onClose: () => void; title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(facing);
  const [canFlip, setCanFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (mode: "user" | "environment") => {
    stop(); setReady(false); setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera here. Choose a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setReady(true);
      try { const devs = await navigator.mediaDevices.enumerateDevices(); setCanFlip(devs.filter((d) => d.kind === "videoinput").length > 1); } catch { /* fine */ }
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(name === "NotAllowedError" ? "Camera access was blocked. Allow it in the browser's address bar, or choose a photo instead."
        : name === "NotFoundError" ? "No camera found on this device. Choose a photo instead."
        : "Couldn't open the camera. Choose a photo instead.");
    }
  }, [stop]);

  useEffect(() => { void start(facingMode); return stop; }, [facingMode, start, stop]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { stop(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, stop]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    const side = Math.min(v.videoWidth, v.videoHeight, 1280);
    canvas.width = v.videoWidth > v.videoHeight ? Math.round(v.videoWidth * (side / v.videoHeight)) : side;
    canvas.height = v.videoHeight > v.videoWidth ? Math.round(v.videoHeight * (side / v.videoWidth)) : side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facingMode === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); } // un-mirror the selfie preview
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`, { type: "image/jpeg" });
      setShot({ url: URL.createObjectURL(blob), file });
      stop();
    }, "image/jpeg", 0.9);
  }

  function use() {
    if (!shot) return;
    URL.revokeObjectURL(shot.url);
    onCapture(shot.file);
    onClose();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 1400, background: "#0F1C2E", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, color: "#fff" }}>
      <div style={{ position: "absolute", top: 16, left: 20, fontWeight: 600 }}>{title}</div>
      <button type="button" onClick={() => { stop(); onClose(); }} aria-label="Close" style={{ position: "absolute", top: 12, right: 16, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>

      <div style={{ position: "relative", width: "min(92vw, 640px)", aspectRatio: "1", borderRadius: 18, overflow: "hidden", background: "#000", display: "grid", placeItems: "center" }}>
        {!shot && <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: facingMode === "user" ? "scaleX(-1)" : undefined, display: error ? "none" : "block" }} />}
        {/* eslint-disable-next-line @next/next/no-img-element -- local capture preview */}
        {shot && <img src={shot.url} alt="Your photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {!shot && !ready && !error && <div style={{ position: "absolute", color: "#CBD6E4", fontSize: 14 }}>Starting the camera…</div>}
        {error && <div style={{ padding: 24, textAlign: "center", color: "#CBD6E4", fontSize: 14, lineHeight: 1.5 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {!shot && !error && (
          <>
            {canFlip && <button type="button" className="btn ghost sm" style={lightBtn} onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}>⟲ Flip camera</button>}
            <button type="button" onClick={capture} disabled={!ready} aria-label="Capture"
              style={{ width: 72, height: 72, borderRadius: "50%", border: "4px solid #fff", background: ready ? "var(--amber)" : "#55637A", cursor: ready ? "pointer" : "wait", boxShadow: "0 0 0 6px rgba(255,255,255,.15)" }} />
            <button type="button" className="btn ghost sm" style={lightBtn} onClick={() => fileRef.current?.click()}>Choose a photo instead</button>
          </>
        )}
        {shot && (
          <>
            <button type="button" className="btn ghost sm" style={lightBtn} onClick={() => { URL.revokeObjectURL(shot.url); setShot(null); void start(facingMode); }}>Retake</button>
            <button type="button" className="rel sm" onClick={use}>Use this photo</button>
          </>
        )}
        {error && <button type="button" className="rel sm" onClick={() => fileRef.current?.click()}>Choose a photo</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture={facingMode} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { stop(); onCapture(f); onClose(); } }} />
    </div>,
    document.body,
  );
}

const lightBtn: React.CSSProperties = { color: "#fff", borderColor: "rgba(255,255,255,.4)", background: "transparent" };
