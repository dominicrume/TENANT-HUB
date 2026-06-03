/**
 * Button — presentational only.
 * NO domain/db/auth imports allowed in this package.
 */
import React from "react";
import { tokens } from "../tokens";

type Variant = "primary" | "accent" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: React.ReactNode;
}

const styles: Record<Variant, React.CSSProperties> = {
  primary: { background: tokens.colors.navy,    color: "#fff" },
  accent:  { background: tokens.colors.amber,   color: tokens.colors.navy },
  ghost:   { background: "transparent",          color: tokens.colors.muted, border: `1px solid ${tokens.colors.border}` },
  danger:  { background: "rgba(224,82,82,0.08)", color: tokens.colors.danger, border: `1px solid rgba(224,82,82,0.2)` },
};

export function Button({ variant = "primary", loading, children, disabled, style, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        minHeight: tokens.spacing.touchMin,
        padding: "9px 18px",
        borderRadius: "8px",
        fontFamily: tokens.fonts.sans.join(","),
        fontSize: "13px",
        fontWeight: 600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        border: "none",
        opacity: disabled ? 0.6 : 1,
        ...styles[variant],
        ...style,
      }}
      {...props}
    >
      {loading ? "…" : children}
    </button>
  );
}
