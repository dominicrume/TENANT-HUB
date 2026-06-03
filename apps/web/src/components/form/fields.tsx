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
