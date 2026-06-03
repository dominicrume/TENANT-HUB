/**
 * Shared styles for the auth pages (login / signup / reset-password).
 * Single source of truth so the three screens stay visually identical.
 * Branded tokens only — navy / amber / cream.
 */
import type { CSSProperties } from "react";

export const page: CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--cream)",
  fontFamily: "'Sora', sans-serif",
  padding: "1.5rem",
};

export const card: CSSProperties = {
  background: "var(--surface)",
  borderRadius: "14px",
  padding: "2rem",
  width: "100%",
  maxWidth: "420px",
  boxShadow: "0 12px 32px rgba(15,28,46,0.14)",
};

export const officialBadge: CSSProperties = {
  position: "absolute",
  top: "20px",
  right: "24px",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "var(--navy)",
  background: "var(--amber)",
  padding: "5px 10px",
  borderRadius: "6px",
};

export const heading: CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: "var(--navy)",
  marginBottom: "4px",
};

export const subBrands: CSSProperties = {
  fontSize: "12px",
  color: "#7A8499",
  marginBottom: "1.5rem",
};

export const label: CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--navy)",
  margin: "14px 0 6px",
};

export const input: CSSProperties = {
  width: "100%",
  minHeight: "44px",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #EDE8E1",
  fontFamily: "'Sora', sans-serif",
  fontSize: "14px",
  boxSizing: "border-box",
};

export const submit: CSSProperties = {
  width: "100%",
  minHeight: "56px",
  marginTop: "20px",
  borderRadius: "8px",
  border: "none",
  background: "var(--navy)",
  color: "#fff",
  fontFamily: "'Sora', sans-serif",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
};

export const errorBox: CSSProperties = {
  marginTop: "14px",
  color: "#E05252",
  background: "rgba(224,82,82,0.08)",
  border: "1px solid rgba(224,82,82,0.2)",
  borderRadius: "8px",
  padding: "10px 12px",
  fontSize: "13px",
};

export const successBox: CSSProperties = {
  marginTop: "14px",
  color: "#1E7F4F",
  background: "rgba(52,200,122,0.10)",
  border: "1px solid rgba(52,200,122,0.25)",
  borderRadius: "8px",
  padding: "10px 12px",
  fontSize: "13px",
};

export const link: CSSProperties = {
  color: "#7A8499",
  fontSize: "12px",
  textDecoration: "none",
};
