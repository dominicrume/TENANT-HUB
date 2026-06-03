/**
 * Design tokens — single source of truth.
 * Used by Tailwind config AND React components.
 * NEVER use generic Tailwind blue-/red- colours in branded components.
 */
export const tokens = {
  colors: {
    navy:    "#0F1C2E",
    amber:   "#E8A84C",
    cream:   "#F8F4EF",
    surface: "#FFFFFF",
    // Semantic
    success: "#34C87A",
    danger:  "#E05252",
    warning: "#F59E0B",
    muted:   "#7A8499",
    border:  "#EDE8E1",
    // AI/Blockchain
    chain:   "#7C3AED",
  },
  fonts: {
    sans: ["Sora", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "Consolas", "monospace"],
  },
  spacing: {
    touchMin: "56px",   // H2: minimum touch target
  },
} as const;

export type ColorToken = keyof typeof tokens.colors;
