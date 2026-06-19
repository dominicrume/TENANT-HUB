"use client";

import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";

interface DigitalSignaturePadProps {
  label?: string;
  value?: string; // base64 string
  onChange: (base64: string, date: string) => void;
}

export function DigitalSignaturePad({ label = "Signature", value, onChange }: DigitalSignaturePadProps) {
  const padRef = useRef<any>(null);
  const [signed, setSigned] = useState(false);
  const [dateStr, setDateStr] = useState<string>("");

  // Only init once if value is provided
  useEffect(() => {
    if (value && value.startsWith("data:image") && !signed) {
      // Small delay to ensure canvas is ready
      setTimeout(() => {
        if (padRef.current) {
          padRef.current.fromDataURL(value);
          setSigned(true);
        }
      }, 100);
    }
  }, [value, signed]);

  const handleClear = () => {
    if (padRef.current) {
      padRef.current.clear();
      setSigned(false);
      onChange("", "");
    }
  };

  const handleEnd = () => {
    if (padRef.current) {
      if (padRef.current.isEmpty()) return;
      const base64 = padRef.current.getTrimmedCanvas().toDataURL("image/png");
      const dt = new Date().toISOString().slice(0, 10);
      setSigned(true);
      setDateStr(dt);
      onChange(base64, dt);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontSize: "12px", color: "#7A8499", fontWeight: 600 }}>{label}</label>
        {signed && (
          <button 
            type="button"
            onClick={handleClear}
            style={{ fontSize: "11px", color: "#E05252", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ 
        border: signed ? "2px solid #34C87A" : "2px dashed #CBD5E1", 
        borderRadius: "8px", 
        background: "#fff", 
        overflow: "hidden",
        position: "relative"
      }}>
        <SignatureCanvas 
          ref={padRef}
          penColor="#0F1C2E"
          canvasProps={{ 
            style: { width: "100%", height: "120px", display: "block" } 
          }}
          onEnd={handleEnd}
        />
        {!signed && (
           <div style={{ position: "absolute", bottom: "10px", right: "10px", fontSize: "10px", color: "#CBD5E1", pointerEvents: "none" }}>
             Draw inside
           </div>
        )}
      </div>
      
      {signed && (
        <div style={{ fontSize: "11px", color: "#1E7F4F", fontWeight: 600, textAlign: "right" }}>
          Signed on: {dateStr || new Date().toISOString().slice(0, 10)}
        </div>
      )}
    </div>
  );
}
