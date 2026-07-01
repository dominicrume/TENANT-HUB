"use client";

import { useState, useEffect, useRef } from "react";

interface DigitalSignaturePadProps {
  label?: string;
  value?: string;
  onChange: (base64: string, date: string) => void;
}

export function DigitalSignaturePad({ label = "Signature", value, onChange }: DigitalSignaturePadProps) {
  const [signed, setSigned] = useState(false);
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (value && value.startsWith("data:image") && !signed) {
      setSigned(true);
    }
  }, [value, signed]);

  const handleSign = () => {
    if (!typedName.trim()) {
      alert("Please type your name to sign.");
      return;
    }
    
    // Generate a base64 image from the typed name
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0F1C2E";
      ctx.font = "italic 40px 'Brush Script MT', cursive, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
    }
    
    const base64 = canvas.toDataURL("image/png");
    const dt = new Date().toISOString().slice(0, 10);
    setSigned(true);
    onChange(base64, dt);
  };

  const handleClear = () => {
    setSigned(false);
    setTypedName("");
    onChange("", "");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <label style={{ fontSize: "12px", color: "#7A8499", fontWeight: 600 }}>{label}</label>
      
      {!signed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <input
            type="text"
            placeholder="Type your full name to sign"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            style={{
              padding: "16px",
              border: "1px solid #CBD5E1",
              borderRadius: "8px",
              fontSize: "14px",
              width: "100%",
              boxSizing: "border-box"
            }}
          />
          <button 
            type="button"
            onClick={handleSign}
            disabled={!typedName.trim()}
            style={{ 
              padding: "16px", 
              border: "none", 
              borderRadius: "8px", 
              background: typedName.trim() ? "var(--navy)" : "#E2E8F0", 
              color: typedName.trim() ? "#fff" : "#94A3B8",
              fontSize: "14px",
              fontWeight: 700,
              cursor: typedName.trim() ? "pointer" : "not-allowed",
              width: "100%",
              textAlign: "center",
              transition: "all 0.2s ease"
            }}
          >
            ✍️ Digitally Sign
          </button>
        </div>
      ) : (
        <div style={{ 
            padding: "16px", 
            border: "2px solid #34C87A", 
            borderRadius: "8px", 
            background: "#f0fdf4", 
            color: "#1E7F4F",
            fontWeight: 700,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
          <span>✅ Signed Digitally</span>
          <img src={value} alt="Signature" style={{ maxHeight: "60px", margin: "0 auto" }} />
          <button 
            type="button" 
            onClick={handleClear}
            style={{ fontSize: "12px", color: "#E05252", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Clear Signature
          </button>
        </div>
      )}
    </div>
  );
}
