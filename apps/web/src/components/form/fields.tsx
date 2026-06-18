/**
 * Form primitives — shared across the tenant detail form and the intake
 * pipeline so every field looks and behaves identically. Branded tokens only.
 */
"use client";

import type { ReactNode } from "react";

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "22px" }}>
      <h3
        style={{
          fontSize: "12px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--amber)",
          marginBottom: "10px",
          borderBottom: "1px solid #EDE8E1",
          paddingBottom: "5px",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
        {children}
      </div>
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--navy)",
  marginBottom: "4px",
};

const controlStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "44px",
  padding: "9px 11px",
  borderRadius: "8px",
  border: "1px solid #EDE8E1",
  fontFamily: "'Sora', sans-serif",
  fontSize: "14px",
  background: "#fff",
  boxSizing: "border-box",
};

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  mono?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>
        {props.label}
        {props.required && <span style={{ color: "#E05252" }}> *</span>}
      </span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        required={props.required}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        style={{
          ...controlStyle,
          fontFamily: props.mono ? "'JetBrains Mono', monospace" : controlStyle.fontFamily,
          background: props.readOnly ? "#F8F4EF" : "#fff",
        }}
      />
    </label>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  required?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>
        {props.label}
        {props.required && <span style={{ color: "#E05252" }}> *</span>}
      </span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)} style={controlStyle}>
        <option value="">—</option>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RatingField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>
        {props.label}
        {props.required && <span style={{ color: "#E05252" }}> *</span>}
      </span>
      <div style={{ display: "flex", gap: "8px", minHeight: "44px", alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => props.onChange(rating)}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: props.value === rating ? "2px solid var(--amber)" : "1px solid #EDE8E1",
              background: props.value === rating ? "var(--amber)" : "#fff",
              color: props.value === rating ? "#fff" : "var(--navy)",
              fontWeight: props.value === rating ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            {rating}
          </button>
        ))}
      </div>
    </label>
  );
}

export function CheckboxGroupField(props: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (props.value.includes(opt)) {
      props.onChange(props.value.filter(v => v !== opt));
    } else {
      props.onChange([...props.value, opt]);
    }
  };

  return (
    <div style={{ display: "block", gridColumn: "1 / -1" }}>
      <span style={labelStyle}>{props.label}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
        {props.options.map((opt) => (
          <label key={opt} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={props.value.includes(opt)}
              onChange={() => toggle(opt)}
              style={{
                width: "18px",
                height: "18px",
                accentColor: "var(--amber)",
                cursor: "pointer"
              }}
            />
            <span style={{ fontSize: "14px", color: "var(--navy)" }}>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
